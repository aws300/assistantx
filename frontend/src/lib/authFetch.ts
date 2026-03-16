/**
 * Authenticated fetch helper — adds Bearer token to all requests.
 *
 * Use this instead of raw `fetch()` for any API call that needs auth.
 * Auth endpoints (Authorize, Token, Logout) should use raw fetch directly.
 */

const CREDENTIALS_KEY = 'credentials';

/** Get the current access token from localStorage */
function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const creds = JSON.parse(raw);
    return creds?.access_token || null;
  } catch {
    return null;
  }
}

/** Build headers with Authorization Bearer token */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
    ...extra,
  };
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Authenticated fetch — wraps native fetch with Bearer token.
 * On 401, triggers OIDC re-auth flow.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const resp = await fetch(input, { ...init, headers });

  if (resp.status === 401) {
    if (!window.location.pathname.startsWith('/auth/')) {
      localStorage.removeItem(CREDENTIALS_KEY);
      const { authStore } = await import('@/stores/auth');
      await authStore.startAuthFlow();
    }
  }

  return resp;
}

/**
 * Build a WebSocket URL with auth token as query parameter.
 */
export function authWebSocketUrl(baseUrl: string): string {
  const token = getAccessToken();
  if (!token) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}access_token=${encodeURIComponent(token)}`;
}
