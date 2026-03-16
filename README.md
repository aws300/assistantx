# AssistantX

A production-ready OIDC authentication platform on Kubernetes, designed as the foundation for AI-agent services. The platform provides a **SolidJS frontend**, a **Go backend** (auth gateway), and a **Python AI-agent** backend — all communicating exclusively over **gRPC / ConnectRPC** using Protocol Buffers.

> All interfaces **must** be defined in `.proto` files first. No REST, no ad-hoc JSON — see [ARCHITECTURE.md](ARCHITECTURE.md).

## System Overview

```
Browser
  │
  └── Envoy Gateway (TLS termination)
        ├── assistantx.nx.run     → Frontend  (SolidJS, nginx)
        └── assistantxapi.nx.run  → Backend   (Go, ConnectRPC :8080)
                                             (Python ai-agent, ConnectRPC :8080)
```

**Backend switching** — the Go backend and Python ai-agent expose identical `auth.v1.AuthService` interfaces. `backendLang: go | python` in Helm values selects which pod is deployed.

## Project Structure

```
assistantx/
├── protos/           # ① Source of truth — all APIs start here
│   ├── auth/v1/auth.proto
│   └── Makefile      # make gen / make gen-python
├── backend/          # ② Go implementation (ConnectRPC)
├── ai-agent/         # ③ Python implementation (connect-python + grpc.aio)
├── frontend/         # ④ SolidJS client (connect-es)
├── charts/           # ⑤ Helm chart (EKS + Envoy Gateway)
└── scripts/
    └── deploy.sh     # build → push → helm upgrade
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of each component.

## Prerequisites

- Kubernetes cluster with [Envoy Gateway](https://gateway.envoyproxy.io/) installed
- A `Gateway` resource already provisioned (default name: `eg`, namespace: `aws300`)
- Helm 3 · Docker · Go 1.22+ · Python 3.13+ · buf · Node 20+

## Quick Start

```bash
# Deploy with Go backend (default)
helm upgrade --install assistantx charts/ \
  --namespace assistantx --create-namespace \
  --set assistantx.host.frontend=assistantx.nx.run \
  --set assistantx.host.backend=assistantxapi.nx.run \
  --set assistantx.config.auth="oidc://CLIENT_ID:SECRET@ISSUER?scope=openid%20profile%20email" \
  --set assistantx.irsaRoleArn="arn:aws:iam::123456789012:role/MyRole"

# Switch to Python ai-agent backend
./scripts/deploy.sh ai-agent
```

## Container Images

| Image | Tag | Description |
|---|---|---|
| `public.ecr.aws/b1y9i2f3/assistantx` | `backend` | Go / ConnectRPC backend |
| `public.ecr.aws/b1y9i2f3/assistantx` | `ai-agent` | Python / connect-python AI agent |
| `public.ecr.aws/b1y9i2f3/assistantx` | `frontend` | SolidJS SPA (nginx) |

## Build & Deploy

```bash
# Generate protobuf stubs (Go + TypeScript)
cd protos && make gen

# Generate Python stubs (for ai-agent)
cd protos && make gen-python

# Build and push individual components
./scripts/deploy.sh backend    # Go backend
./scripts/deploy.sh ai-agent   # Python ai-agent
./scripts/deploy.sh frontend   # SolidJS frontend

# Build everything and deploy
./scripts/deploy.sh all
```

## Helm Values Reference

| Key | Default | Description |
|---|---|---|
| `global.gateway` | `eg` | Name of the Envoy `Gateway` resource |
| `global.gatewayNamespace` | `aws300` | Namespace where the `Gateway` lives |
| `assistantx.backendLang` | `go` | Backend implementation: `go` or `python` |
| `assistantx.image.backend` | `…assistantx:backend` | Go backend image |
| `assistantx.image.aiAgent` | `…assistantx:ai-agent` | Python ai-agent image |
| `assistantx.image.frontend` | `…assistantx:frontend` | Frontend image |
| `assistantx.host.frontend` | — | **(Required)** Frontend hostname |
| `assistantx.host.backend` | `""` | Separate API hostname (optional) |
| `assistantx.config.auth` | — | **(Required)** OIDC DSN — see format below |
| `assistantx.irsaRoleArn` | `""` | IAM Role ARN for IRSA (optional) |

### OIDC DSN Format

```
oidc://CLIENT_ID:CLIENT_SECRET@ISSUER_HOST/PATH?scope=openid%20profile%20email[&oidc_logout=false]
```

| Parameter | Notes |
|---|---|
| `CLIENT_ID:CLIENT_SECRET` | OIDC application credentials |
| `ISSUER_HOST/PATH` | Discovery base URL (appended with `/.well-known/openid-configuration`) |
| `scope` | URL-encoded scopes |
| `oidc_logout=false` | For providers without RP-initiated logout (e.g. Cognito) |

**Examples:**
```bash
# Cognito
oidc://APP_CLIENT_ID:SECRET@cognito-idp.us-west-2.amazonaws.com/us-west-2_PoolId?scope=openid%20profile%20email&oidc_logout=false

# Generic (Keycloak, Auth0, account.nx.run …)
oidc://CLIENT_ID:SECRET@auth.example.com/realms/myrealm?scope=openid%20profile%20email
```

## API Reference

All endpoints follow the ConnectRPC unary request pattern: `POST /{package}.{Service}/{Method}`.

### Public (no Bearer token required)

| RPC | Path | Description |
|---|---|---|
| `Authorize` | `/auth.v1.AuthService/Authorize` | Start PKCE authorization flow, returns redirect URL |
| `Token` | `/auth.v1.AuthService/Token` | Exchange code or refresh token |
| `Logout` | `/auth.v1.AuthService/Logout` | Build OIDC end-session URL |
| — | `GET /healthz` | Liveness/readiness probe |

### Protected (Bearer token required)

| RPC | Path | Description |
|---|---|---|
| `GetUserInfo` | `/auth.v1.AuthService/GetUserInfo` | Validate token offline, return user claims |

## IRSA (AWS IAM Roles for Service Accounts)

When `assistantx.irsaRoleArn` is set, the Helm chart creates a `ServiceAccount` annotated with the role ARN and binds it to the backend pod. EKS injects `AWS_ROLE_ARN` and `AWS_WEB_IDENTITY_TOKEN_FILE` into the container environment.

The IRSA role annotation is preserved in Helm even when the ai-agent backend is selected — so AI-agent code can access AWS APIs using the same IRSA credential chain.

## Uninstall

```bash
helm uninstall assistantx --namespace assistantx
kubectl delete namespace assistantx
```
