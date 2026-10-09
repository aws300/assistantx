# Architecture

## Core Principle: Proto-First, gRPC Everywhere

> **All service interfaces must be defined as Protocol Buffer services and exposed via gRPC / ConnectRPC. No ad-hoc REST endpoints or raw JSON APIs.**

Every new capability follows the same lifecycle:

```
1. Define in protos/           (.proto file)
2. Generate stubs              (make gen / make gen-python)
3. Implement the handler       (backend/ or agent/)
4. Register on the server
```

This ensures every interface is strongly typed, language-agnostic, and self-documenting.

---

## System Topology

```
                        ┌────────────────────────────────────────────┐
                        │  Kubernetes (EKS)  ns: assistantx           │
                        │                                              │
Browser ──HTTPS──► Envoy│  ┌─────────────┐   ┌───────────────────┐  │
                  Gateway  │  Frontend   │   │  Backend (Go)     │  │
                  (eg)   │  │  SolidJS   │   │  ConnectRPC :8080 │  │
                        │  │  nginx :80  │   │  gRPC      :8081  │  │
                        │  └─────────────┘   └───────────────────┘  │
                        │                                              │
                        │  ┌──────────────────────────────────────┐  │
                        │  │  Agent (Python)                       │  │
                        │  │  LiveKit voice agent (Nova Sonic S2S) │  │
                        │  └──────────────────────────────────────┘  │
                        └────────────────────────────────────────────┘

Routing (Envoy HTTPRoute):
  assistantx.nx.run      →  assistantx-frontend :80
  assistantxapi.nx.run   →  assistantx-backend  :8080

LiveKit:
  wss://livekit.nx.run   ←→  Agent ←→ Frontend (WebRTC)
```

---

## 1. Protocol Buffer Definitions — `protos/`

```
protos/
├── auth/v1/auth.proto        # auth.v1.AuthService
├── livekit/v1/livekit.proto  # livekit.v1.LivekitService
├── irsa/v1/irsa.proto        # irsa.v1.IRSAService
├── buf.yaml
├── buf.gen.yaml              # Go + TypeScript stub generation
├── buf.gen.python.yaml       # Python stub generation (agent)
└── Makefile
    ├── make gen              # → backend/pkg/pb/  + frontend/src/gen/
    └── make gen-python       # → agent/src/generated/
```

### Adding a New Service

1. Create `protos/<package>/v<N>/<package>.proto`
2. Run `make gen` (and `make gen-python` if the agent implements it)
3. Implement the handler in `backend/` and/or `agent/`
4. Register on the server

---

## 2. Go Backend — `backend/`

The Go backend uses [common-go/grpcmux](https://github.com/ti/common-go) to serve both the Connect protocol (browser-compatible HTTP/1.1 + HTTP/2) and native gRPC on the same port.

```
backend/
├── cmd/server/main.go               # Entry point
├── configs/config.yaml              # Config (injected by Helm ConfigMap)
├── Dockerfile
├── internal/
│   ├── dependencies/
│   │   ├── dependencies.go          # OIDC provider wiring
│   │   └── oidc/oidc.go             # JWKS cache, JWT validation
│   └── server/
│       ├── auth_middleware.go       # JWT validation interceptor
│       ├── auth_service.go          # auth.v1.AuthService
│       └── livekit_service.go       # livekit.v1.LivekitService (token + skills)
└── pkg/pb/                          # Generated stubs (do not edit)
```

### Services

| Service | Description |
|---|---|
| `auth.v1.AuthService` | PKCE auth flow, token exchange, user info |
| `livekit.v1.LivekitService` | LiveKit room token, agent dispatch, skill YAML |
| `irsa.v1.IRSAService` | AWS IRSA credential info |

### Auth Architecture

```
Request → grpcmux.WithAuthFunc(NewAuthFunc)
            ├── NoAuthPrefixes? → pass through
            └── validate Bearer (offline JWKS)
                  ├── valid  → handler
                  └── invalid → UNAUTHENTICATED
```

### Adding a New Service (Go)

```go
// 1. backend/internal/server/my_service.go
type MyServer struct { myv1connect.UnimplementedMyServiceHandler }

// 2. cmd/server/main.go
server.RegisterMyService(gs, deps)
```

---

## 3. Python Agent — `agent/`

A LiveKit voice agent using Nova Sonic speech-to-speech (realtime mode). On each session it loads device skill YAML, generates function tools, and dispatches actions to the frontend via RPC.

```
agent/
├── Dockerfile
├── pyproject.toml               # entry: agent = lkagent.run:main
├── requirements.txt
├── configs/config.yaml          # Config (overridden by Helm ConfigMap)
├── skills/devices/              # Device skill YAML (vehicle / home / charger)
└── src/lkagent/
    ├── agent.py                 # Session entrypoint, RealtimeVoiceAgent, LLMAgent
    ├── skills/
    │   ├── skill_loader.py      # Loads YAML skill definitions
    │   ├── tool_generator.py    # Generates LiveKit function tools from skills
    │   └── action_dispatcher.py # RPC dispatch to frontend (executeAction)
    └── rag/
        └── knowledge_base.py    # AWS Bedrock knowledge base tool
```

### Session Flow

```
LiveKit dispatch (scene metadata)
  └── entrypoint(ctx)
        ├── load_skills_and_tools(scene)   # YAML → function tools
        ├── create_realtime_session()      # Nova Sonic RealtimeModel
        ├── RealtimeVoiceAgent(tools)      # Agent with S2S + tool calling
        ├── setup_data_listener(room)      # Text input handler
        └── session.start()
              │
              User speaks / types
              │
              Nova Sonic processes → calls tool (session_exit, hvac.setTemp, …)
              │
              ActionDispatcher.dispatch(action)
              │
              RPC executeAction → Frontend
              │
              Frontend ActionExecutor → state update
```

### Skill YAML Format

```yaml
# skills/devices/vehicle.yaml
skills:
  - id: hvac.setTemperature
    name: "Set A/C Temperature"
    description: "..."
    triggers: ["make it warmer", "set the A/C to 25 degrees"]
    parameters:
      - name: temperature
        type: integer
        min: 16
        max: 30
    action:
      id: hvac.setTemperature
      payload_template: { temperature: "${temperature}" }
    responses:
      success: "The A/C is set to ${temperature} degrees"

  - id: session.exit
    category: session
    name: "Exit Session"
    description: "End the current voice session"
    triggers: ["goodbye", "exit", "close", "dismiss"]
    parameters: []
    action:
      id: session.disconnect
      payload_template: {}
    responses:
      success: "OK, goodbye"
```

---

## 4. Frontend — `frontend/`

SolidJS SPA with Tailwind CSS v4. Communicates with the backend via ConnectRPC and with the LiveKit agent via WebRTC. The voice chat panel is a React micro-island using `@livekit/components-react`.

```
frontend/src/
├── api/client.ts            # ConnectRPC transport + clients
├── gen/                     # Generated stubs (buf)
├── pages/
│   ├── Landing.tsx          # Scene selector
│   ├── Cockpit.tsx          # Vehicle controls (car scene)
│   ├── SmartHome.tsx        # Home controls (home scene)
│   └── Charger.tsx          # EV charger controls (charger scene)
├── react/
│   └── LivekitChat.ts       # React micro-island (useChat, RoomAudioRenderer, BarVisualizer)
├── components/
│   └── ChatPanelBridge.tsx  # SolidJS wrapper that mounts the React chat panel
├── skills/
│   └── ActionExecutor.ts    # RPC handler + 40+ device action handlers
└── stores/
    ├── vehicleStore.ts
    ├── homeStore.ts
    └── chargerStore.ts
```

### ConnectRPC Client

```typescript
const transport = createConnectTransport({
    baseUrl: BACKEND_URL || window.location.origin,
    useBinaryFormat: CONNECT_PROTOCOL !== 'json',
});
export const authClient   = createClient(AuthService,    transport);
export const livekitClient = createClient(LivekitService, transport);
```

### Chat Panel Architecture

The voice chat panel is a **React micro-island** mounted inside the SolidJS page. This approach uses `@livekit/components-react` hooks for proper turn-taking and audio management:

```
SolidJS Page
  └── ChatPanelBridge.tsx  (SolidJS)
        └── mountLivekitChat(container)
              └── LivekitChat.ts  (React)
                    ├── RoomContext.Provider
                    ├── RoomAudioRenderer    ← automatic audio management
                    ├── useChat().send()     ← proper turn-taking / interruption
                    ├── useVoiceAssistant()  ← agent state (listening/thinking/speaking)
                    ├── useTranscriptions()  ← voice transcript display
                    └── BarVisualizer        ← speaking animation
```

### Action Execution Flow

```
Agent calls executeAction RPC
  └── r.registerRpcMethod('executeAction')
        └── ActionExecutor.executeAction({ id, params })
              └── handler(params) → store mutation → UI update
```

---

## 5. Helm Chart — `charts/`

```
charts/
├── Chart.yaml
├── values.yaml              # assistantx.* configuration
├── values.schema.json       # Schema validation
└── templates/
    ├── backend.yaml         # ConfigMap + Service + Deployment (Go)
    ├── agent.yaml           # ConfigMap + Service + Deployment (Python)
    ├── frontend.yaml        # Service + Deployment (nginx)
    ├── httproute.yaml       # Envoy HTTPRoute
    └── serviceaccount.yaml  # IRSA ServiceAccount
```

### Config Injection

The Helm chart injects two ConfigMaps:

**Backend** (`assistantx-backend-config`):
```yaml
dependencies:
  auth: "oidc://..."
livekit:
  url: "wss://livekit.nx.run"
  apiKey: "..."
  agentName: "AssistantX"
  skillsDir: "/app/skills/devices"
```

**Agent** (`assistantx-agent-config`):
```yaml
livekit:
  url: "wss://livekit.nx.run"
  api_key: "..."
agent:
  name: "AssistantX"
voice_mode: "realtime"
nova_sonic:
  model_version: "nova-sonic-2"
llm:
  provider: "bedrock"
  region: "us-west-2"
```

---

## 6. Deployment Pipeline — `scripts/deploy.sh`

```bash
./scripts/deploy.sh backend    # build Go image → push → restart pod
./scripts/deploy.sh agent      # build Python image → push → helm upgrade
./scripts/deploy.sh frontend   # build nginx image → push → restart pod
./scripts/deploy.sh helm       # helm upgrade only (no image build)
./scripts/deploy.sh all        # build all → push chart → helm upgrade
```

---

## Interface Contract Rules

1. **Proto first.** Define the API in `.proto` before writing any implementation.
2. **No HTTP handlers outside proto.** No raw `http.HandleFunc`, FastAPI routes, etc.
3. **Package naming.** `<domain>.v<N>` (e.g. `auth.v1`, `livekit.v1`). Breaking changes → new version.
4. **Backward compatibility.** Never remove or rename fields. Use `reserved` to retire field numbers.
5. **Auth is central.** New services inherit the auth interceptor automatically — no per-handler auth.
6. **Error codes.** Use gRPC status codes (`UNAUTHENTICATED`, `NOT_FOUND`, etc.).
