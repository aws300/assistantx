# AssistantX

An AI voice assistant platform on Kubernetes — combining an OIDC auth gateway, a LiveKit-powered voice agent, and a multi-scene SolidJS frontend. Users interact through voice or text; the agent understands intent, executes device-control actions via RPC, and responds with speech.

## Architecture

```
Browser (SolidJS)
  │
  └── Envoy Gateway (TLS)
        ├── assistantx.nx.run      → Frontend  (SolidJS + nginx)
        └── assistantxapi.nx.run   → Backend   (Go, ConnectRPC :8080)

LiveKit Server (wss://livekit.nx.run)
  └── agent/   (Python LiveKit agent, Nova Sonic realtime)
        └── RPC executeAction → Frontend (device control)
```

**Three components, each in its own directory:**

| Dir | Lang | Role |
|---|---|---|
| `backend/` | Go | OIDC auth gateway + LiveKit token service (ConnectRPC) |
| `agent/` | Python | LiveKit voice agent — Nova Sonic S2S, skill dispatch, RAG |
| `frontend/` | SolidJS | Multi-scene SPA — car / home / charger controls + chat panel |

## Project Structure

```
assistantx/
├── protos/          # Source of truth — all APIs defined here first
│   ├── auth/v1/auth.proto
│   ├── livekit/v1/livekit.proto
│   └── Makefile     # make gen (Go + TS) / make gen-python
├── backend/         # Go ConnectRPC server (auth + LiveKit token)
├── agent/           # Python LiveKit agent (Nova Sonic + skills)
│   ├── src/lkagent/ # Agent source
│   ├── skills/      # Device skill YAML definitions
│   └── configs/     # Agent config (overridden by Helm ConfigMap)
├── frontend/        # SolidJS + Tailwind v4 SPA
│   └── src/
│       ├── pages/   # Cockpit / SmartHome / Charger / Landing
│       ├── react/   # React micro-island (LiveKit chat panel)
│       └── skills/  # Frontend action executor
├── charts/          # Helm chart (EKS + Envoy Gateway)
└── scripts/
    └── deploy.sh    # build → push → helm upgrade
```

## Prerequisites

- Kubernetes cluster with [Envoy Gateway](https://gateway.envoyproxy.io/) installed
- A `Gateway` resource already provisioned
- Helm 3 · Docker · Go 1.22+ · Python 3.13+ · Node 20+ · buf

## Quick Start

```bash
# 1. Install (first time)
helm upgrade --install app charts/ \
  --namespace assistantx --create-namespace \
  --set assistantx.host.frontend=assistantx.example.com \
  --set assistantx.host.backend=assistantxapi.example.com \
  --set assistantx.config.auth="oidc://CLIENT_ID:SECRET@issuer.example.com?scope=openid%20profile%20email" \
  --set assistantx.irsaRoleArn="arn:aws:iam::123456789012:role/MyRole"

# 2. Build and deploy everything
./scripts/deploy.sh all
```

## Build & Deploy

```bash
# Individual components
./scripts/deploy.sh backend    # Go backend (:backend)
./scripts/deploy.sh agent      # Python agent (:agent)
./scripts/deploy.sh frontend   # SolidJS frontend (:frontend)

# All images + Helm chart + deploy
./scripts/deploy.sh all

# Helm-only (no build)
./scripts/deploy.sh helm
```

## Container Images

| Image | Tag | Description |
|---|---|---|
| `public.ecr.aws/b1y9i2f3/assistantx` | `backend` | Go / ConnectRPC backend |
| `public.ecr.aws/b1y9i2f3/assistantx` | `agent` | Python / LiveKit voice agent |
| `public.ecr.aws/b1y9i2f3/assistantx` | `frontend` | SolidJS SPA (nginx) |

## Helm Values Reference

| Key | Default | Description |
|---|---|---|
| `global.gateway` | `eg` | Envoy `Gateway` resource name |
| `global.gatewayNamespace` | `aws300` | Namespace where the Gateway lives |
| `assistantx.image.backend` | `…:backend` | Go backend image |
| `assistantx.image.agent` | `…:agent` | Python agent image |
| `assistantx.image.frontend` | `…:frontend` | Frontend image |
| `assistantx.host.frontend` | — | **(Required)** Frontend hostname |
| `assistantx.host.backend` | `""` | Separate API hostname (optional) |
| `assistantx.config.auth` | — | **(Required)** OIDC DSN |
| `assistantx.config.livekit.url` | — | LiveKit server WebSocket URL |
| `assistantx.config.livekit.apiKey` | — | LiveKit API key |
| `assistantx.config.livekit.apiSecret` | — | LiveKit API secret |
| `assistantx.config.livekit.agentName` | `AssistantX` | Agent name for dispatch |
| `assistantx.irsaRoleArn` | `""` | IAM Role ARN for IRSA (AWS Bedrock access) |

### OIDC DSN Format

```
oidc://CLIENT_ID:CLIENT_SECRET@ISSUER_HOST?scope=openid%20profile%20email
```

Examples:
```bash
# Cognito
oidc://APP_CLIENT_ID:SECRET@cognito-idp.us-west-2.amazonaws.com/us-west-2_PoolId?scope=openid%20profile%20email&oidc_logout=false

# Generic (Keycloak, Auth0, etc.)
oidc://CLIENT_ID:SECRET@auth.example.com/realms/myrealm?scope=openid%20profile%20email
```

## API Reference

All endpoints follow ConnectRPC: `POST /{package}.{Service}/{Method}`

### Auth (public)

| RPC | Path |
|---|---|
| `Authorize` | `/auth.v1.AuthService/Authorize` |
| `Token` | `/auth.v1.AuthService/Token` |
| `Logout` | `/auth.v1.AuthService/Logout` |

### LiveKit (requires Bearer token)

| RPC | Path |
|---|---|
| `GetToken` | `/livekit.v1.LivekitService/GetToken` |
| `GetSkills` | `/livekit.v1.LivekitService/GetSkills` |
| `GetDeviceSkills` | `/livekit.v1.LivekitService/GetDeviceSkills` |

## IRSA (AWS Bedrock Access)

When `assistantx.irsaRoleArn` is set, the Helm chart creates a `ServiceAccount` annotated with the role ARN and binds it to both the backend and agent pods. EKS injects `AWS_ROLE_ARN` + `AWS_WEB_IDENTITY_TOKEN_FILE` for credential-less Bedrock access.

```bash
# Create IRSA role
./scripts/deploy.sh create-irsa-role MyAssistantXRole
```

## Uninstall

```bash
helm uninstall app --namespace assistantx
kubectl delete namespace assistantx
```
