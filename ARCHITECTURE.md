# Architecture

## Core Principle: Proto-First, gRPC Everywhere

> **All service interfaces in this project must be defined as Protocol Buffer services and exposed via gRPC / ConnectRPC. No REST endpoints, no ad-hoc JSON APIs.**

Every new capability — whether it lives in the Go backend, the Python ai-agent, or any future service — follows the same lifecycle:

```
1. Define the contract in protos/
2. Generate stubs  (make gen / make gen-python)
3. Implement the service
4. Register it on the server
```

This ensures that every interface is:
- **Strongly typed** — request and response shapes are enforced by the compiler
- **Language-agnostic** — Go, Python, and TypeScript clients all share the same generated types
- **Self-documenting** — the `.proto` file is the definitive API contract
- **HTTP/2 native** — gRPC runs over HTTP/2; ConnectRPC additionally supports HTTP/1.1 and browser clients without a proxy

---

## System Topology

```
                          ┌─────────────────────────────────────────┐
                          │  Kubernetes (EKS)  ns: assistantx        │
                          │                                           │
Browser ──HTTPS──► Envoy  │  ┌────────────┐    ┌─────────────────┐  │
                  Gateway │  │  Frontend  │    │    Backend      │  │
                  (eg)    │  │  SolidJS   │    │  Go  │  Python  │  │
                          │  │  nginx     │    │      │ ai-agent │  │
                          │  │  :80       │    │  :8080  │ :8080  │  │
                          │  └────────────┘    │         │ :8081  │  │
                          │                    └─────────────────┘  │
                          └─────────────────────────────────────────┘

Routing (Envoy HTTPRoute):
  assistantx.nx.run       →  assistantx-frontend :80
  assistantxapi.nx.run    →  assistantx-backend  :8080
```

**Backend is a single Deployment** — at any time it runs either the Go image or the Python ai-agent image, controlled by `assistantx.backendLang` in Helm values. Both images expose identical proto-defined APIs on the same ports.

---

## 1. Protocol Buffer Definitions — `protos/`

```
protos/
├── auth/v1/auth.proto        # auth.v1.AuthService
├── buf.yaml                  # buf lint + breaking-change config
├── buf.gen.yaml              # Go + TypeScript stub generation
├── buf.gen.python.yaml       # Python stub generation (ai-agent)
└── Makefile
    ├── make gen              # → backend/pkg/pb/  + frontend/src/gen/
    └── make gen-python       # → ai-agent/src/authspa/generated/
```

### Adding a New Service

1. Create `protos/<package>/v<N>/<package>.proto`
2. Define `service`, `message` types
3. Run `make gen` (and `make gen-python` if the ai-agent implements it)
4. Implement the server-side handler in `backend/` and/or `ai-agent/`
5. Register the handler on the gRPC/Connect server

**Never** add an HTTP handler, REST route, or WebSocket endpoint outside of protobuf.

---

## 2. Go Backend — `backend/`

The Go backend is the production-grade implementation. It uses
[common-go/grpcmux](https://github.com/ti/common-go) which wraps ConnectRPC to serve
both the **Connect protocol** (browser-compatible, HTTP/1.1 + HTTP/2) and native **gRPC**
(HTTP/2) on the same port.

```
backend/
├── cmd/server/main.go               # Entry point
├── configs/config.yaml              # Default config (auth DSN injected by Helm)
├── Dockerfile
├── go.mod                           # module github.com/assistantx/backend
├── internal/
│   ├── dependencies/
│   │   ├── dependencies.go          # Wires all external deps (OIDC provider)
│   │   └── oidc/oidc.go             # OIDC: discovery, JWKS cache, JWT validation
│   └── server/
│       ├── auth_middleware.go       # NewAuthFunc — JWT validation interceptor
│       └── auth_service.go          # auth.v1.AuthService implementation
└── pkg/pb/                          # Generated stubs (do not edit manually)
    └── auth/v1/
        ├── auth.pb.go               # protoc-gen-go
        └── authv1connect/auth.connect.go  # protoc-gen-connect-go
```

### Server Startup (`cmd/server/main.go`)

```go
gs := grpcmux.NewServer(
    grpcmux.WithAuthFunc(server.NewAuthFunc(...)),   // central JWT check
    grpcmux.WithNoAuthPrefixes("/healthz",
        "/auth.v1.AuthService/Authorize", ...),
)
server.RegisterAuthService(gs, cfg.Dependencies.Auth)
gs.Start()  // binds :8080 (Connect+gRPC), :8081 (gRPC native), :9090 (metrics)
```

### Adding a New Service (Go)

```go
// 1. internal/server/my_service.go
type MyServer struct { myv1connect.UnimplementedMyServiceHandler }
func (s *MyServer) MyMethod(ctx context.Context, req *connect.Request[myv1.MyRequest]) (*connect.Response[myv1.MyResponse], error) { ... }

// 2. Register in cmd/server/main.go
server.RegisterMyService(gs, deps)
```

### Auth Architecture

```
Request
  │
  ▼
grpcmux.WithAuthFunc(NewAuthFunc(provider))
  │
  ├─ path in NoAuthPrefixes? ──► pass through
  │
  └─ validate Bearer token (offline JWKS)
       ├─ valid  ──► handler
       └─ invalid ─► UNAUTHENTICATED
```

`NewAuthFunc` performs **offline JWT validation** — it verifies the RS256 signature against the JWKS cache (fetched once at startup, refreshed on unknown `kid` using `singleflight` to avoid thundering herd).

---

## 3. Python AI-Agent — `ai-agent/`

The Python ai-agent is a dual-protocol server built on
[connect-python](https://github.com/connectrpc/connect-python) (ASGI, Connect + gRPC protocols)
and [grpc.aio](https://grpc.github.io/grpc/python/) (native gRPC). It implements the same
`auth.v1.AuthService` interface as the Go backend and is designed to be extended with
AI-specific services (LLM calls, vector search, agent orchestration).

```
ai-agent/
├── Dockerfile                       # Proto stubs generated inside Docker (Stage 1)
├── pyproject.toml                   # name: ai-agent, entry: ai-agent = authspa.server.main:run
├── requirements.txt
├── configs/config.yaml              # Default config skeleton (no auth DSN)
└── src/
    ├── auth/                        # Import bridge: auth.v1 → authspa/generated/auth/v1/
    │   └── v1/__init__.py
    └── authspa/
        ├── config/                  # Pydantic Settings (apis.httpAddr, dependencies.auth)
        ├── logging.py               # structlog JSON logger
        ├── oidc/                    # OIDCProvider: discovery, JWKS cache, JWT validation
        ├── services/
        │   └── auth_service.py      # auth.v1.AuthService (Connect + gRPC methods)
        ├── server/
        │   └── main.py              # Bootstrap: dual-protocol server, auth interceptors
        └── generated/               # Generated stubs (grpcio-tools, gitignored)
            └── auth/v1/
                ├── auth_pb2.py
                └── auth_pb2_grpc.py
```

### Dual-Protocol Server

The ai-agent serves **two ports simultaneously**:

| Port | Protocol | Library | Use case |
|---|---|---|---|
| `8080` | Connect (HTTP/1.1 + HTTP/2) + gRPC | Hypercorn + connect-python | Frontend, browser clients |
| `8081` | gRPC (HTTP/2) | grpc.aio | Server-to-server, native gRPC clients |

Both ports enforce the same auth interceptor logic.

### Proto Import Bridge

Generated stubs are placed in `src/authspa/generated/auth/v1/`. The file
`src/auth/v1/__init__.py` extends `__path__` so that `from auth.v1 import auth_pb2` resolves
correctly (matching the proto package declaration `package auth.v1`).

### Adding a New Service (Python)

```python
# 1. ai-agent/src/authspa/services/my_service.py
from my_pkg.v1 import my_pb2, my_pb2_grpc

class MyService(my_pb2_grpc.MyServiceServicer):
    async def my_method(self, request, ctx):     # Connect (snake_case)
        ...
    async def MyMethod(self, request, context):  # gRPC (PascalCase)
        ...

# 2. Register in server/main.py — _build_connect_app() and _serve_grpc()
```

```python
# In _build_connect_app():
"/my_pkg.v1.MyService/MyMethod": Endpoint.unary(
    method=_m("MyMethod", "my_pkg.v1.MyService", my_pb2.MyRequest, my_pb2.MyResponse),
    function=my_svc.my_method,
),

# In _serve_grpc():
my_pb2_grpc.add_MyServiceServicer_to_server(my_svc, server)
```

### Auth Architecture (Python)

```
Connect request
  │
  ▼
_AuthInterceptor.intercept_unary()
  │
  ├─ method in _NO_AUTH_CONNECT? ──► pass through
  │
  └─ validate Bearer token (OIDCProvider.validate_token)
       │  offline: JWKS in-memory cache
       │  cold path: single JWKS refresh (asyncio.Task deduplicated)
       ├─ valid  ──► handler
       └─ invalid ─► ConnectError(UNAUTHENTICATED)

gRPC request
  │
  ▼
_GRPCAuthInterceptor (grpc.aio.ServerInterceptor)
  └─ same logic via grpc.StatusCode.UNAUTHENTICATED
```

---

## 4. Frontend — `frontend/`

The frontend is a **SolidJS** SPA. It communicates with the backend **exclusively via
ConnectRPC** — there are no direct REST or fetch calls to the API.

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts            # createConnectTransport + authClient
│   ├── gen/                     # Generated TypeScript stubs (buf → protoc-gen-es)
│   │   └── auth/v1/
│   │       ├── auth_pb.ts       # Message types
│   │       └── auth_connect.ts  # ServiceClient
│   ├── stores/
│   │   └── auth.ts              # Auth state: credentials, PKCE flow, token refresh
│   ├── config.ts                # Runtime config: backendUrl, connectProtocol
│   └── pages/
│       ├── Home.tsx
│       ├── AuthCallback.tsx     # Handles /auth/oidc/callback
│       └── AuthLogoutCallback.tsx
└── Dockerfile                   # Vite build → nginx
```

### ConnectRPC Client

```typescript
// src/api/client.ts
const transport = createConnectTransport({
    baseUrl: BACKEND_URL || window.location.origin,
    // Sends: Content-Type: application/connect+proto
    // Works over HTTP/1.1 and HTTP/2 without a grpc-web proxy
});

export const authClient = createClient(AuthService, transport);
```

`BACKEND_URL` is injected at runtime by the nginx container entrypoint as
`window.__CONFIG__.backendUrl`. When empty, all API calls use relative paths
(same-origin, path-based routing).

### Adding a New Service (Frontend)

```typescript
// After running `make gen`:
import { createClient } from "@connectrpc/connect";
import { MyService } from "@/gen/my_pkg/v1/my_pb_connect";

export const myClient = createClient(MyService, transport);

// Usage:
const response = await myClient.myMethod({ field: "value" });
```

---

## 5. Helm Chart — `charts/`

```
charts/
├── Chart.yaml
├── values.yaml                  # Default values — assistantx.*
├── values.schema.json           # Validated by Helm
└── templates/
    ├── backend.yaml             # ConfigMap + Service + Deployment
    ├── frontend.yaml            # Service + Deployment (nginx)
    ├── httproute.yaml           # Envoy HTTPRoute (frontend + backend)
    └── serviceaccount.yaml      # IRSA ServiceAccount (when irsaRoleArn set)
```

### Backend Switching

The single `assistantx-backend` Deployment runs either the Go image or the Python
ai-agent image — not both simultaneously.

```yaml
# values.yaml
assistantx:
  backendLang: go        # "go" → image.backend / "python" → image.aiAgent
  image:
    backend:  public.ecr.aws/b1y9i2f3/assistantx:backend
    aiAgent:  public.ecr.aws/b1y9i2f3/assistantx:ai-agent
```

```bash
# Switch to Go:
helm upgrade assistantx charts/ --set assistantx.backendLang=go

# Switch to Python ai-agent:
./scripts/deploy.sh ai-agent
```

### Config Injection

The Helm ConfigMap injects the OIDC DSN and server addresses into the pod at
`/app/configs/config.yaml`. The Go backend reads it via `common-go/config.Init`;
the Python ai-agent reads it via `authspa.config.load_config()`.

```yaml
# Injected config (same format for both backends)
dependencies:
  auth: "oidc://..."
apis:
  httpAddr: ":8080"
  grpcAddr: ":8081"
  metricsAddr: ":9090"
```

---

## 6. Deployment Pipeline — `scripts/deploy.sh`

```
./scripts/deploy.sh backend     # build Go image → push → restart pod
./scripts/deploy.sh ai-agent    # build Python image → push → helm upgrade (backendLang=python)
./scripts/deploy.sh frontend    # build nginx image → push → restart pod
./scripts/deploy.sh helm        # helm upgrade only (no image build)
./scripts/deploy.sh all         # build all → helm upgrade
```

---

## Interface Contract Rules

The following rules apply to all contributors:

1. **Proto first.** Define the API in a `.proto` file before writing any implementation code.

2. **No HTTP handlers outside proto.** Do not add `http.HandleFunc`, FastAPI routes, Express routes, or any other HTTP handler that is not backed by a proto service definition.

3. **Package naming.** Proto packages follow `<domain>.v<N>` (e.g. `auth.v1`, `agent.v1`). The first stable version is always `v1`. Breaking changes require a new version (`v2`).

4. **Backward compatibility.** Never remove or rename fields in existing messages. Add new fields with new field numbers. Use `reserved` to retire old numbers.

5. **Auth is handled centrally.** Do not implement per-handler authentication. Register new services on the existing grpcmux/Connect server and they automatically inherit the auth interceptor.

6. **Error codes.** Use gRPC status codes (`UNAUTHENTICATED`, `PERMISSION_DENIED`, `NOT_FOUND`, etc.) — not HTTP status codes. ConnectRPC maps them to HTTP automatically.
