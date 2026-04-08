# AssistantX

An AI voice assistant platform on Kubernetes — combining an OIDC auth gateway, a LiveKit-powered voice agent, and a multi-scene SolidJS frontend. Users interact through voice or text; the agent understands intent, executes device-control actions via RPC, and responds with speech.

## Architecture

```
Browser (SolidJS)
  │
  └── Envoy Gateway (TLS)
        ├── assistantx.example.com       → Frontend  (SolidJS + nginx)
        └── assistantxapi.example.com    → Backend   (Go, ConnectRPC :443)
                                         → LiveKit   (WSS signaling    :7883)
                                         → LiveKit   (WebRTC TCP media :7881)

LiveKit Server (in-cluster)
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
- A `Gateway` resource already provisioned with listeners on ports 443, 7883, 7881
- Helm 3 · Docker · Go 1.22+ · Python 3.13+ · Node 20+ · buf

## Helm Chart (OCI)

The chart is published to ECR Public and can be installed directly without cloning the repo.

```bash
helm upgrade --install app \
  oci://public.ecr.aws/b1y9i2f3/assistantx \
  --version 0.2.0 \
  --namespace assistantx --create-namespace \
  ...values...
```

## Quick Start Examples

### Minimal install (same domain, path-based routing)

```bash
helm upgrade --install app \
  oci://public.ecr.aws/b1y9i2f3/assistantx --version 0.2.0 \
  --namespace assistantx --create-namespace \
  --set global.gateway=eg \
  --set global.gatewayNamespace=envoy-gateway-system \
  --set global.httpsListenerName=https \
  --set assistantx.host.frontend=assistantx.example.com \
  --set assistantx.config.auth="oidc://CLIENT_ID:SECRET@auth.example.com?scope=openid%20profile%20email" \
  --set assistantx.config.livekit.apiKey=mykey \
  --set assistantx.config.livekit.apiSecret=mysecret \
  --set assistantx.livekitServer.nodeIp=1.2.3.4
```

### Full install (separate backend domain, AWS EKS + Global Accelerator)

```bash
helm upgrade --install app \
  oci://public.ecr.aws/b1y9i2f3/assistantx --version 0.2.0 \
  --namespace assistantx --create-namespace \
  \
  --set global.gateway=eg \
  --set global.gatewayNamespace=aws300 \
  --set global.httpsListenerName=https \
  \
  --set assistantx.host.frontend=assistantx.example.com \
  --set assistantx.host.backend=assistantxapi.example.com \
  \
  --set assistantx.config.auth="oidc://CLIENT_ID:SECRET@auth.example.com?scope=openid%20profile%20email%20offline" \
  \
  --set assistantx.config.livekit.apiKey=APIxxxxxxxxxxxxxxx \
  --set assistantx.config.livekit.apiSecret=my_livekit_secret_here \
  --set assistantx.config.livekit.agentName=AssistantX \
  --set assistantx.config.livekit.voiceMode=realtime \
  \
  --set assistantx.livekitServer.nodeIp=166.117.138.22 \
  \
  --set assistantx.irsaRoleArn=arn:aws:iam::123456789012:role/AssistantXIRSA
```

### Install from local chart (development)

```bash
helm upgrade --install app charts/ \
  --namespace assistantx --create-namespace \
  --set global.httpsListenerName=https \
  --set assistantx.host.frontend=assistantx.example.com \
  --set assistantx.host.backend=assistantxapi.example.com \
  --set assistantx.config.auth="oidc://CLIENT_ID:SECRET@auth.example.com?scope=openid%20profile%20email" \
  --set assistantx.config.livekit.apiKey=mykey \
  --set assistantx.config.livekit.apiSecret=mysecret \
  --set assistantx.livekitServer.nodeIp=1.2.3.4
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

# Push Helm chart to OCI registry
./scripts/deploy.sh chart
```

## Container Images

| Image | Tag | Description |
|---|---|---|
| `public.ecr.aws/b1y9i2f3/assistantx` | `backend` | Go / ConnectRPC backend |
| `public.ecr.aws/b1y9i2f3/assistantx` | `agent` | Python / LiveKit voice agent |
| `public.ecr.aws/b1y9i2f3/assistantx` | `frontend` | SolidJS SPA (nginx) |
| `oci://public.ecr.aws/b1y9i2f3/assistantx` | `0.1.0` | Helm chart |

## Helm Values Reference

### Global

| Key | Default | Description |
|---|---|---|
| `global.gateway` | `eg` | Envoy `Gateway` resource name |
| `global.gatewayNamespace` | `envoy-gateway-system` | Namespace where the Gateway lives |
| `global.httpsListenerName` | `https` | Gateway HTTPS listener name for backend HTTPRoute. Restricts routing to this listener only, preventing conflicts with other HTTPS ports (e.g. `:7883`). Set to your listener name or leave empty to match all. |

### Images

| Key | Default | Description |
|---|---|---|
| `assistantx.image.backend` | `…:backend` | Go backend image |
| `assistantx.image.agent` | `…:agent` | Python agent image |
| `assistantx.image.frontend` | `…:frontend` | Frontend image |

### Hostnames

| Key | Default | Description |
|---|---|---|
| `assistantx.host.frontend` | — | **(Required)** Frontend hostname |
| `assistantx.host.backend` | `""` | Separate API hostname. When set, backend RPCs use this domain; otherwise shares `host.frontend` via path routing |

### OIDC Auth

| Key | Default | Description |
|---|---|---|
| `assistantx.config.auth` | — | **(Required)** OIDC DSN — see format below |

### LiveKit

| Key | Default | Description |
|---|---|---|
| `assistantx.config.livekit.apiKey` | — | **(Required)** LiveKit API key |
| `assistantx.config.livekit.apiSecret` | — | **(Required)** LiveKit API secret |
| `assistantx.config.livekit.agentName` | `AssistantX` | Agent name for room dispatch |
| `assistantx.config.livekit.voiceMode` | `realtime` | `realtime` (Nova Sonic) or `traditional` (STT+LLM+TTS) |
| `assistantx.config.livekit.novaSonic.modelVersion` | `nova-sonic-2` | Nova Sonic model version |
| `assistantx.config.livekit.novaSonic.voice` | `tiffany` | TTS voice |
| `assistantx.config.livekit.novaSonic.region` | `us-east-1` | AWS region for Nova Sonic |

### LiveKit Server (in-cluster)

| Key | Default | Description |
|---|---|---|
| `assistantx.livekitServer.image` | `livekit/livekit-server:v1.9` | LiveKit server image |
| `assistantx.livekitServer.nodeIp` | `""` | **(Required)** External IP advertised in WebRTC ICE TCP candidates. Must be the IP reachable by clients on port 7881 (e.g. your Global Accelerator or LoadBalancer IP) |

### IRSA

| Key | Default | Description |
|---|---|---|
| `assistantx.irsaRoleArn` | `""` | IAM Role ARN for IRSA. When set, creates a ServiceAccount with `eks.amazonaws.com/role-arn` annotation for credential-less AWS Bedrock access |

## Envoy Gateway — Required Listeners

The chart expects three listeners on your Gateway resource:

```yaml
listeners:
  # Standard HTTPS (port 443) — frontend + backend ConnectRPC
  - name: https        # value of global.httpsListenerName
    port: 443
    protocol: HTTPS
    tls:
      mode: Terminate
      certificateRefs:
        - name: your-tls-secret

  # LiveKit WSS signaling (port 7883) — TLS terminated by Envoy, plain ws to pod
  - name: https-7883
    port: 7883
    protocol: HTTPS
    tls:
      mode: Terminate
      certificateRefs:
        - name: your-tls-secret   # same cert as above
    allowedRoutes:
      namespaces:
        from: All

  # LiveKit WebRTC TCP media (port 7881) — raw TCP passthrough
  - name: tcp-7881
    port: 7881
    protocol: TCP
    allowedRoutes:
      namespaces:
        from: All
```

> **Note**: The LiveKit TCP media port (7881) must match `livekitServer.nodeIp` so that WebRTC ICE candidates resolve correctly. Clients connect to `<nodeIp>:7881` for media.

## OIDC DSN Format

```
oidc://CLIENT_ID:CLIENT_SECRET@ISSUER_HOST?scope=openid%20profile%20email
```

| Parameter | Notes |
|---|---|
| `CLIENT_ID:CLIENT_SECRET` | OIDC application credentials |
| `ISSUER_HOST` | Discovery base URL (appended with `/.well-known/openid-configuration`) |
| `scope` | URL-encoded scopes |
| `oidc_logout=false` | For providers without RP-initiated logout (e.g. Cognito) |

Examples:
```bash
# AWS Cognito
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
# Create IRSA role with required Bedrock permissions
./scripts/deploy.sh create-irsa-role MyAssistantXRole
```

## Uninstall

```bash
helm uninstall app --namespace assistantx
kubectl delete namespace assistantx
```
