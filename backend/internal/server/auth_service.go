// Package server implements the Connect RPC AuthService.
// Copyright 2026 AssistantX Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/grpc-ecosystem/go-grpc-middleware/v2/metadata"
	"github.com/ti/common-go/grpcmux"
	"github.com/ti/common-go/log"

	"github.com/assistantx/backend/internal/dependencies/oidc"
	authv1 "github.com/assistantx/backend/pkg/pb/auth/v1"
	"github.com/assistantx/backend/pkg/pb/auth/v1/authv1connect"
)

// tokenClient talks to the IdP token endpoint. It has a timeout so a slow IdP
// cannot pin request goroutines open indefinitely.
var tokenClient = &http.Client{Timeout: 10 * time.Second}

// oauthErrorPattern matches RFC 6749 error codes such as "invalid_grant".
var oauthErrorPattern = regexp.MustCompile(`^[a-z_]{1,64}$`)

// maxTokenResponseBytes caps the IdP token response read into memory.
const maxTokenResponseBytes = 1 << 20

// AuthServer implements the ConnectRPC AuthService.
type AuthServer struct {
	authv1connect.UnimplementedAuthServiceHandler

	// provider is nil when auth is disabled (guest mode).
	provider *oidc.Provider
}

// GetUserInfo returns user claims from the validated Bearer token.
// Token validation is handled centrally by WithAuthFunc in main.go.
// When auth is disabled (provider == nil / guest mode), returns a guest identity.
func (s *AuthServer) GetUserInfo(
	ctx context.Context,
	req *connect.Request[authv1.GetUserInfoRequest],
) (*connect.Response[authv1.UserInfo], error) {
	// Guest mode: no OIDC provider configured — return a guest identity.
	if s.provider == nil {
		return connect.NewResponse(&authv1.UserInfo{
			Sub: "guest",
		}), nil
	}

	// Token has already been validated by WithAuthFunc. Re-validate here only
	// to extract claims — no need to check for errors a second time since an
	// invalid token would have been rejected before reaching this handler.
	authHeader := metadata.ExtractIncoming(ctx).Get("authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")

	claims, err := s.provider.ValidateToken(token)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token"))
	}

	return connect.NewResponse(&authv1.UserInfo{
		Sub:       claims.Sub,
		Name:      claims.Name,
		Email:     claims.Email,
		Picture:   claims.Picture,
		ProjectId: claims.ProjectID,
	}), nil
}

// Authorize returns an OIDC authorization URL for PKCE flow.
// Returns Unimplemented when auth is disabled.
func (s *AuthServer) Authorize(
	ctx context.Context,
	req *connect.Request[authv1.AuthorizeRequest],
) (*connect.Response[authv1.AuthorizeResponse], error) {
	if s.provider == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, fmt.Errorf("auth is disabled"))
	}

	disc := s.provider.GetDiscovery()
	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {s.provider.ClientID},
		"redirect_uri":          {req.Msg.RedirectUri},
		"code_challenge":        {req.Msg.CodeChallenge},
		"code_challenge_method": {"S256"},
		"state":                 {req.Msg.State},
		"scope":                 {s.provider.Scopes},
	}
	authURL := disc.AuthorizationEndpoint + "?" + params.Encode()
	return connect.NewResponse(&authv1.AuthorizeResponse{
		AuthorizeUrl: authURL,
	}), nil
}

// Token exchanges an authorization code for tokens, or refreshes an existing token.
// Returns Unimplemented when auth is disabled.
func (s *AuthServer) Token(
	ctx context.Context,
	req *connect.Request[authv1.TokenRequest],
) (*connect.Response[authv1.TokenResponse], error) {
	if s.provider == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, fmt.Errorf("auth is disabled"))
	}

	disc := s.provider.GetDiscovery()

	form := url.Values{
		"grant_type": {req.Msg.GrantType},
		"client_id":  {s.provider.ClientID},
	}
	if s.provider.ClientSecret != "" {
		form.Set("client_secret", s.provider.ClientSecret)
	}

	switch req.Msg.GrantType {
	case "authorization_code":
		form.Set("code", req.Msg.Code)
		form.Set("redirect_uri", req.Msg.RedirectUri)
		form.Set("code_verifier", req.Msg.CodeVerifier)
	case "refresh_token":
		form.Set("refresh_token", req.Msg.RefreshToken)
	default:
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("unsupported grant_type: %s", req.Msg.GrantType))
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", disc.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		log.Action("AuthToken").Error("build token request: %v", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("token exchange failed"))
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	httpResp, err := tokenClient.Do(httpReq)
	if err != nil {
		log.Action("AuthToken").Error("call token endpoint: %v", err)
		return nil, connect.NewError(connect.CodeUnavailable, errors.New("token exchange failed"))
	}
	defer httpResp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(httpResp.Body, maxTokenResponseBytes))
	if err != nil {
		log.Action("AuthToken").Error("read token response: %v", err)
		return nil, connect.NewError(connect.CodeUnavailable, errors.New("token exchange failed"))
	}
	if httpResp.StatusCode != http.StatusOK {
		// Only the OAuth error code goes back to the client; the IdP's full
		// response stays in the server log.
		log.Action("AuthToken").Warn("token endpoint status %d: %s", httpResp.StatusCode, body)
		var oauthErr struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &oauthErr)
		if !oauthErrorPattern.MatchString(oauthErr.Error) {
			oauthErr.Error = "token_exchange_failed"
		}
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New(oauthErr.Error))
	}

	var tokenResp struct {
		TokenType    string `json:"token_type"`
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int32  `json:"expires_in"`
		IDToken      string `json:"id_token"`
		Sub          string `json:"sub"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		log.Action("AuthToken").Error("decode token response: %v", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("token exchange failed"))
	}

	return connect.NewResponse(&authv1.TokenResponse{
		TokenType:    tokenResp.TokenType,
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		ExpiresIn:    tokenResp.ExpiresIn,
		IdToken:      tokenResp.IDToken,
		Sub:          tokenResp.Sub,
	}), nil
}

// Logout returns an OIDC end_session_endpoint URL for the client to redirect to.
// Returns Unimplemented when auth is disabled.
func (s *AuthServer) Logout(
	ctx context.Context,
	req *connect.Request[authv1.LogoutRequest],
) (*connect.Response[authv1.LogoutResponse], error) {
	if s.provider == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, fmt.Errorf("auth is disabled"))
	}

	disc := s.provider.GetDiscovery()
	if disc.EndSessionEndpoint == "" {
		return nil, connect.NewError(connect.CodeFailedPrecondition, fmt.Errorf("end_session_endpoint not available"))
	}

	var logoutURL string
	if s.provider.OIDCLogout {
		// Standard OIDC end_session flow: post_logout_redirect_uri + optional id_token_hint
		logoutURL = fmt.Sprintf("%s?client_id=%s&post_logout_redirect_uri=%s",
			disc.EndSessionEndpoint,
			url.QueryEscape(s.provider.ClientID),
			url.QueryEscape(req.Msg.RedirectUri),
		)
		if req.Msg.IdTokenHint != "" {
			logoutURL += fmt.Sprintf("&id_token_hint=%s", url.QueryEscape(req.Msg.IdTokenHint))
		}
	} else {
		// Non-standard logout flow (e.g. Cognito): uses logout_uri instead of
		// post_logout_redirect_uri, omits id_token_hint.
		logoutURL = fmt.Sprintf("%s?client_id=%s&logout_uri=%s",
			disc.EndSessionEndpoint,
			url.QueryEscape(s.provider.ClientID),
			url.QueryEscape(req.Msg.RedirectUri),
		)
	}

	return connect.NewResponse(&authv1.LogoutResponse{
		LogoutUrl: logoutURL,
	}), nil
}

// RegisterAuthService registers the AuthService ConnectRPC handler on the given grpcmux server.
// provider may be nil, in which case the service operates in guest mode.
func RegisterAuthService(gs *grpcmux.Server, provider *oidc.Provider) {
	srv := &AuthServer{provider: provider}
	path, handler := authv1connect.NewAuthServiceHandler(srv)
	grpcmux.RegisterConnectHandler(gs, path, handler)
}
