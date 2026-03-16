// Package main is the entry point for the assistantx backend server.
// It provides auth.v1.AuthService (OIDC proxy).
package main

import (
	"context"

	"github.com/ti/common-go/config"
	"github.com/ti/common-go/grpcmux"
	"github.com/ti/common-go/log"

	"github.com/assistantx/backend/internal/dependencies"
	"github.com/assistantx/backend/internal/server"
)

// Config defines the full server configuration.
type Config struct {
	Dependencies dependencies.Dependencies
	Apis         grpcmux.Config
	Livekit      *server.LivekitConfig `yaml:"livekit"`
}

func main() {
	// 1. Initialize configuration and dependencies via common-go config.Init.
	//    config.Init reads configs/config.yaml (or $CONFIG_PATH),
	//    and automatically calls dependencies.Init on the Dependencies field.
	var cfg Config
	if err := config.Init(context.Background(), "", &cfg); err != nil {
		log.Action("InitConfig").Fatal(err.Error())
	}

	// 2. Create the grpcmux server with:
	//    - WithCORS: explicit CORS configuration (allow all origins)
	//    - WithAuthFunc: centralized JWT token validation via OIDC provider
	//    - WithNoAuthPrefixes: paths that bypass authentication
	//      (OIDC handshake endpoints, health check, and skills endpoint)
	gs := grpcmux.NewServer(
		grpcmux.WithConfig(&cfg.Apis),
		grpcmux.WithCORS(grpcmux.CORSConfig{
			AllowedOrigins: []string{"*"},
		}),
		grpcmux.WithAuthFunc(server.NewAuthFunc(cfg.Dependencies.Auth)),
		grpcmux.WithNoAuthPrefixes(
			"/healthz",
			"/auth.v1.AuthService/Authorize",
			"/auth.v1.AuthService/Token",
			"/auth.v1.AuthService/Logout",
			"/livekit.v1.LivekitService/GetSkills",
			"/livekit.v1.LivekitService/GetDeviceSkills",
		),
	)

	// 3. Register AuthService via ConnectRPC.
	server.RegisterAuthService(gs, cfg.Dependencies.Auth)

	// 4. Register LivekitService via ConnectRPC (token generation + skills).
	server.RegisterLivekitService(gs, cfg.Dependencies.Auth, cfg.Livekit)

	// 5. Start server (blocks until shutdown).
	gs.Start()
}
