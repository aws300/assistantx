// Package dependencies wires all external dependencies for the scaffolding backend.
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
