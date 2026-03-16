// Package server implements the Connect RPC AuthService.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"connectrpc.com/connect"
	"github.com/grpc-ecosystem/go-grpc-middleware/v2/metadata"
	"github.com/ti/common-go/grpcmux"

	"github.com/assistantx/backend/internal/dependencies/oidc"
	authv1 "github.com/assistantx/backend/pkg/pb/auth/v1"
	"github.com/assistantx/backend/pkg/pb/auth/v1/authv1connect"
)

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
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
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
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("build token request: %w", err))
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	httpResp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer httpResp.Body.Close()

	body, _ := io.ReadAll(httpResp.Body)
	if httpResp.StatusCode != http.StatusOK {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("token endpoint: %s", string(body)))
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
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("decode token response: %w", err))
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
