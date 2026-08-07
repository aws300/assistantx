// Copyright 2026 AssistantX Authors
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Runtime configuration injected by the container entrypoint into index.html
 * as window.__CONFIG__ = { backendUrl: "...", connectProtocol: "..." }.
 *
 * backendUrl rules:
 *  - Set (e.g. "https://authapis.nx.run") → absolute URL for cross-origin calls.
 *  - Empty / missing / placeholder → "" → fetch uses relative paths (same-origin).
 *
 * connectProtocol rules:
 *  - "proto" (default) → Content-Type: application/proto  (binary protobuf)
 *  - "json"            → Content-Type: application/json   (Connect JSON)
 *  - Missing / placeholder → falls back to "proto".
 */

function resolveBackendUrl(): string {
  const raw: unknown = (window as any).__CONFIG__?.backendUrl;
  if (
    typeof raw !== 'string' ||
    raw === '' ||
    raw.startsWith('__') // catches "__BACKEND_URL_PLACEHOLDER__"
  ) {
    return '';
  }
  return raw;
}

function resolveConnectProtocol(): 'proto' | 'json' {
  const raw: unknown = (window as any).__CONFIG__?.connectProtocol;
  if (typeof raw === 'string' && !raw.startsWith('__') && raw === 'json') {
    return 'json';
  }
  return 'proto'; // default
}

/** Base URL for all backend API calls.
 *  Empty string → relative path (same-origin / nginx proxy).
 *  Non-empty   → absolute URL, e.g. "https://authapis.nx.run".
 */
export const BACKEND_URL: string = resolveBackendUrl();

/** ConnectRPC wire format.
 *  "proto" → application/proto (binary, default).
 *  "json"  → application/json.
 */
export const CONNECT_PROTOCOL: 'proto' | 'json' = resolveConnectProtocol();
