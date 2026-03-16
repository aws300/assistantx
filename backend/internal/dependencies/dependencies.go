// Package dependencies wires all external dependencies for the scaffolding backend.
package dependencies

import (
	"github.com/ti/common-go/dependencies"

	"github.com/assistantx/backend/internal/dependencies/oidc"
)

// Dependencies holds all external dependencies for the scaffolding backend.
// The embedded dependencies.Dependency marker enables automatic initialization
// via common-go's config.Init.
type Dependencies struct {
	dependencies.Dependency

	// Auth is the OIDC provider, initialized from the "auth" DSN in config.
	// DSN format: oidc://clientID:clientSecret@issuer_host?scope=...
	Auth *oidc.Provider `required:"false"`
}
