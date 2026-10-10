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

## One-Click AWS Deployment (CloudFormation)

[`scripts/CloudFormation.yaml`](scripts/CloudFormation.yaml) creates the whole environment in one
stack: VPC (IPv4 + IPv6), EKS Auto Mode, Envoy Gateway, EFS, Cognito (OIDC), CloudFront,
Global Accelerator and the AssistantX Helm release — no existing cluster needed.

**Download:** [CloudFormation.yaml](https://raw.githubusercontent.com/aws300/assistantx/main/scripts/CloudFormation.yaml)

```bash
curl -fLO https://raw.githubusercontent.com/aws300/assistantx/main/scripts/CloudFormation.yaml
```

### Deploy

The template is larger than the 51 KB inline limit, so it goes through S3. With the AWS CLI
(`--s3-bucket` is any bucket you own in the target region):

```bash
aws cloudformation deploy \
  --region us-east-2 \
  --stack-name assistantx \
  --template-file CloudFormation.yaml \
  --s3-bucket <your-bucket-in-us-east-2> \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides ProjectName=AssistantX EnvironmentId=001
```

Or in the console: **CloudFormation → Create stack → Upload a template file**, choose
`CloudFormation.yaml`, and acknowledge the IAM capability on the last page.

Creation takes about 30–40 minutes. To follow it (status and new events every 5 minutes,
printing the outputs on success or the failing resources on failure):

```bash
./scripts/cfn-monitor.sh --stack assistantx --region us-east-2
```

### Parameters

| Parameter | Default | Notes |
|---|---|---|
| `ProjectName` / `EnvironmentId` | `AssistantX` / `001` | Prefix of every resource name; use a different `EnvironmentId` for a second stack in the same account |
| `VpcCidr` | `10.80.0.0/16` | VPC IPv4 range |
| `EksVersion` | `1.35` | `1.33`, `1.34` or `1.35` |
| `EnvoyGatewayVersion` | `v1.7.0` | Envoy Gateway release |
| `AdminRoleArn` | — | Optional IAM role granted EKS cluster-admin (for console / kubectl access) |
| `CloudFrontCertificateArn` / `CloudFrontAliases` | — | Optional us-east-1 ACM certificate and matching CNAMEs for a custom domain |
| `CloudFrontWebAclArn` | — | Optional WAFv2 WebACL (scope `CLOUDFRONT`, created in us-east-1). In us-east-1 the stack creates its own when empty; in other regions leave it empty to run without WAF |

### After deployment

The stack **Outputs** have everything needed to use it:

| Output | Use |
|---|---|
| `CloudFrontDomain` | Open `https://<CloudFrontDomain>` — the AssistantX web app |
| `CognitoAdminUsername` / `CognitoAdminPassword` | First login (change the password afterwards) |
| `GlobalAcceleratorHost` | Backend API + LiveKit endpoint |
| `EksClusterName` | `aws eks update-kubeconfig --region us-east-2 --name <EksClusterName>` |

The release runs in namespace `assistantx-<EnvironmentId>`. Bedrock is reached through the
stack's `PodRole`; set your own knowledge base with
`helm upgrade … --reuse-values --set assistantx.config.livekit.knowledgeBase.id=<KB_ID>`.

To remove everything: `aws cloudformation delete-stack --region us-east-2 --stack-name assistantx`
(run `cfn-monitor.sh` alongside it — it clears detached Lambda network interfaces that would
otherwise hold the VPC subnets for a long time).

## Prerequisites

For installing the Helm chart on an existing cluster:

- Kubernetes cluster with [Envoy Gateway](https://gateway.envoyproxy.io/) installed
- A `Gateway` resource already provisioned with listeners on ports 443, 7883, 7881
- Helm 3 · Docker · Go 1.22+ · Python 3.13+ · Node 20+ · buf

## Helm Chart (OCI)

The chart is published to ECR Public and can be installed directly without cloning the repo.

```bash
helm upgrade --install app \
  oci://public.ecr.aws/r0l7m8u0/assistantx \
  --version 0.2.2 \
  --namespace assistantx --create-namespace \
  ...values...
```

## Quick Start Examples

### Minimal install (same domain, path-based routing)

```bash
helm upgrade --install app \
  oci://public.ecr.aws/r0l7m8u0/assistantx --version 0.2.2 \
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
  oci://public.ecr.aws/r0l7m8u0/assistantx --version 0.2.2 \
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
./scripts/deploy.sh backend    # Go backend   (ghcr.io/aws300/deploy:assistantx-backend)
./scripts/deploy.sh agent      # Python agent (ghcr.io/aws300/deploy:assistantx-agent)
./scripts/deploy.sh frontend   # SolidJS frontend (ghcr.io/aws300/deploy:assistantx-frontend)

# All images + Helm chart + deploy
./scripts/deploy.sh all

# Helm-only (no build)
./scripts/deploy.sh helm

# Push Helm chart to OCI registry
./scripts/deploy.sh chart
```

## Container Images

Public, multi-arch (`linux/amd64` + `linux/arm64`):

| Image | Tag | Description |
|---|---|---|
| `ghcr.io/aws300/deploy` | `assistantx-backend` | Go / ConnectRPC backend |
| `ghcr.io/aws300/deploy` | `assistantx-agent` | Python / LiveKit voice agent |
| `ghcr.io/aws300/deploy` | `assistantx-frontend` | SolidJS SPA (nginx) |
| `oci://public.ecr.aws/r0l7m8u0/assistantx` | `0.2.2` | Helm chart |

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
| `assistantx.image.backend` | `ghcr.io/aws300/deploy:assistantx-backend` | Go backend image |
| `assistantx.image.agent` | `ghcr.io/aws300/deploy:assistantx-agent` | Python agent image |
| `assistantx.image.frontend` | `ghcr.io/aws300/deploy:assistantx-frontend` | Frontend image |

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
