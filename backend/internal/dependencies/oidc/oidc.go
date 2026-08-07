// Copyright 2026 AssistantX Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Package oidc implements OIDC discovery, JWKS fetching, and JWT validation
// as a common-go compatible dependency.
package oidc

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// Discovery holds the OpenID Connect discovery document fields.
type Discovery struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserInfoEndpoint      string `json:"userinfo_endpoint"`
	JwksURI               string `json:"jwks_uri"`
	EndSessionEndpoint    string `json:"end_session_endpoint"`
}

// JWK represents a single JSON Web Key.
type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
	Use string `json:"use"`
}

// JWKS represents a JSON Web Key Set.
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// Claims represents the JWT claims extracted from an access or ID token.
type Claims struct {
	Iss       string `json:"iss"`
	Sub       string `json:"sub"`
	Aud       string `json:"aud"`
	Exp       int64  `json:"exp"`
	Iat       int64  `json:"iat"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Picture   string `json:"picture"`
}

// Provider manages OIDC discovery, JWKS key fetching, and JWT validation.
// It implements the common-go dependencyInit interface via Init(*url.URL).
type Provider struct {
	discovery    *Discovery
	keys         map[string]*rsa.PublicKey
	mu           sync.RWMutex
	sfg          singleflight.Group // deduplicates concurrent JWKS refresh calls
	client       *http.Client
	ClientID     string
	ClientSecret string
	Scopes       string
	// OIDCLogout controls whether to use the standard OIDC end_session_endpoint
	// logout flow (true, default) or a non-standard logout_uri flow (false).
	// Set via oidc_logout=false in the auth URL query string.
	// When false, the logout URL uses logout_uri instead of post_logout_redirect_uri
	// and omits id_token_hint (compatible with Cognito-style providers).
	OIDCLogout bool
}

// Init implements the common-go dependencies.dependencyInit interface.
// The URI format is: oidc://clientID:clientSecret@issuer_host?scope=...
// It fetches the OIDC discovery document and JWKS on initialization.
func (p *Provider) Init(ctx context.Context, u *url.URL) error {
	p.client = &http.Client{Timeout: 10 * time.Second}
	p.keys = make(map[string]*rsa.PublicKey)

	p.ClientID = u.User.Username()
	p.ClientSecret, _ = u.User.Password()

	issuer := fmt.Sprintf("https://%s%s", u.Host, u.Path)

	scopes, _ := url.QueryUnescape(u.Query().Get("scope"))
	if scopes == "" {
		scopes = "openid profile email"
	}
	p.Scopes = scopes

	// oidc_logout defaults to true; set to false to use non-standard logout_uri flow.
	p.OIDCLogout = true
	if u.Query().Get("oidc_logout") == "false" {
		p.OIDCLogout = false
	}

	if err := p.fetchDiscovery(ctx, issuer); err != nil {
		return fmt.Errorf("fetch discovery: %w", err)
	}
	if err := p.fetchJWKS(ctx); err != nil {
		return fmt.Errorf("fetch jwks: %w", err)
	}
	return nil
}

// GetDiscovery returns the cached OIDC discovery document.
func (p *Provider) GetDiscovery() *Discovery {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.discovery
}

func (p *Provider) fetchDiscovery(ctx context.Context, issuer string) error {
	discoveryURL := strings.TrimRight(issuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, "GET", discoveryURL, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var d Discovery
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		return err
	}
	p.mu.Lock()
	p.discovery = &d
	p.mu.Unlock()
	return nil
}

func (p *Provider) fetchJWKS(ctx context.Context) error {
	p.mu.RLock()
	jwksURI := p.discovery.JwksURI
	p.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, "GET", jwksURI, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return err
	}

	keys := make(map[string]*rsa.PublicKey)
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" {
			continue
		}
		pub, err := parseRSAPublicKey(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}

	p.mu.Lock()
	p.keys = keys
	p.mu.Unlock()
	return nil
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nStr)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eStr)
	if err != nil {
		return nil, err
	}
	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: e}, nil
}

// ValidateToken validates a JWT access or ID token against JWKS.
// Returns claims if valid, error if not.
func (p *Provider) ValidateToken(tokenStr string) (*Claims, error) {
	parts := strings.SplitN(tokenStr, ".", 3)
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid jwt format")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("decode header: %w", err)
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, err
	}
	if header.Alg != "RS256" {
		return nil, fmt.Errorf("unsupported alg: %s", header.Alg)
	}

	p.mu.RLock()
	key, ok := p.keys[header.Kid]
	p.mu.RUnlock()
	if !ok {
		// Try refreshing JWKS once (key rotation).
		// singleflight ensures that concurrent requests with an unknown kid
		// share a single HTTP round-trip instead of each issuing their own.
		p.sfg.Do("jwks", func() (any, error) {
			return nil, p.fetchJWKS(context.Background())
		})
		p.mu.RLock()
		key, ok = p.keys[header.Kid]
		p.mu.RUnlock()
		if !ok {
			return nil, fmt.Errorf("unknown key id: %s", header.Kid)
		}
	}

	signingInput := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("decode signature: %w", err)
	}

	hashed := sha256.Sum256([]byte(signingInput))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, hashed[:], signature); err != nil {
		return nil, fmt.Errorf("invalid signature: %w", err)
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode claims: %w", err)
	}
	var claims Claims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, err
	}

	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}
