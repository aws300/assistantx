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
package oidc

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

const testIssuer = "https://issuer.example.com/pool"

func newTestProvider(t *testing.T) (*Provider, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	p := &Provider{
		discovery: &Discovery{Issuer: testIssuer},
		keys:      map[string]*rsa.PublicKey{"k1": &key.PublicKey},
		ClientID:  "my-client",
		// A recent refresh keeps unknown-kid lookups from hitting the network.
		lastRefresh: time.Now(),
	}
	return p, key
}

func sign(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	enc := func(v any) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	input := enc(map[string]string{"alg": "RS256", "kid": kid}) + "." + enc(claims)
	h := sha256.Sum256([]byte(input))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, h[:])
	if err != nil {
		t.Fatal(err)
	}
	return input + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func TestValidateToken(t *testing.T) {
	p, key := newTestProvider(t)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	now := time.Now().Unix()
	base := func() map[string]any {
		return map[string]any{"iss": testIssuer, "sub": "u1", "aud": "my-client", "exp": now + 300, "token_use": "id"}
	}
	with := func(k string, v any) map[string]any {
		c := base()
		if v == nil {
			delete(c, k)
		} else {
			c[k] = v
		}
		return c
	}

	tests := []struct {
		name   string
		token  string
		reason string // empty = valid
	}{
		{"id token", sign(t, key, "k1", base()), ""},
		{"aud array", sign(t, key, "k1", with("aud", []string{"x", "my-client"})), ""},
		{"no token_use", sign(t, key, "k1", with("token_use", nil)), ""},
		{"cognito access token", sign(t, key, "k1", map[string]any{"iss": testIssuer, "sub": "u1", "client_id": "my-client", "token_use": "access", "exp": now + 300}), ""},
		{"wrong issuer", sign(t, key, "k1", with("iss", "https://evil.example.com")), "issuer"},
		{"wrong audience", sign(t, key, "k1", with("aud", "other-client")), "client"},
		{"access token for other client", sign(t, key, "k1", map[string]any{"iss": testIssuer, "sub": "u1", "client_id": "other", "token_use": "access", "exp": now + 300}), "client"},
		{"expired", sign(t, key, "k1", with("exp", now-3600)), "expired"},
		{"missing exp", sign(t, key, "k1", with("exp", nil)), "expired"},
		{"not yet valid", sign(t, key, "k1", with("nbf", now+3600)), "not yet valid"},
		{"missing sub", sign(t, key, "k1", with("sub", nil)), "subject"},
		{"unknown token_use", sign(t, key, "k1", with("token_use", "refresh")), "token_use"},
		{"forged signature", sign(t, other, "k1", base()), "signature"},
		{"unknown kid", sign(t, key, "k2", base()), "unknown key id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := p.ValidateToken(tt.token)
			if tt.reason == "" {
				if err != nil {
					t.Fatalf("expected valid, got %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.reason) {
				t.Fatalf("expected error containing %q, got %v", tt.reason, err)
			}
		})
	}
}
