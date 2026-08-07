// Package server provides ConnectRPC service implementations and shared auth middleware.
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
	"fmt"
	"strings"

	"github.com/grpc-ecosystem/go-grpc-middleware/v2/metadata"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/assistantx/backend/internal/dependencies/oidc"
)

// NewAuthFunc returns a grpcmux-compatible AuthFunc that validates Bearer tokens
// using the given OIDC provider.
//
// When provider is nil (guest mode), the function is a no-op: every request
// passes through without token inspection.
//
// The function reads the "authorization" key from gRPC incoming metadata, which
// is automatically populated by the grpcmux HTTP interceptor from the HTTP
// Authorization header.
func NewAuthFunc(provider *oidc.Provider) func(ctx context.Context) (context.Context, error) {
	return func(ctx context.Context) (context.Context, error) {
		// Guest mode: no OIDC provider configured — allow all requests.
		if provider == nil {
			return ctx, nil
		}

		// Extract the Authorization header via gRPC incoming metadata.
		// grpcmux's HTTP interceptor injects HTTP headers into metadata before
		// calling this function, so this works for both HTTP and native gRPC.
		authHeader := metadata.ExtractIncoming(ctx).Get("authorization")
		if authHeader == "" {
			return ctx, status.Error(codes.Unauthenticated, "missing authorization header")
		}
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return ctx, status.Error(codes.Unauthenticated, "authorization header must use Bearer scheme")
		}
		token := strings.TrimPrefix(authHeader, "Bearer ")

		if _, err := provider.ValidateToken(token); err != nil {
			return ctx, status.Error(codes.Unauthenticated, fmt.Sprintf("invalid token: %v", err))
		}

		return ctx, nil
	}
}
