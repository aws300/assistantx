import { createClient, ConnectError, Code } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import type { Interceptor } from '@connectrpc/connect';
import { BACKEND_URL, CONNECT_PROTOCOL } from '../config';
import { AuthService } from '../gen/auth/v1/auth_pb';
import { IRSAService } from '../gen/irsa/v1/irsa_pb';
import { LivekitService } from '../gen/livekit/v1/livekit_pb';
import { guestMode } from '../stores/auth';

/**
 * Called when the backend returns CodeUnauthenticated.
 * Populated by auth.ts after the store is created to avoid circular imports.
 */
export let onUnauthenticated: (() => Promise<void>) | null = null;
export function setUnauthenticatedHandler(fn: () => Promise<void>) {
  onUnauthenticated = fn;
}

/**
 * ConnectRPC interceptor that injects the Authorization Bearer token
 * from localStorage credentials on every request that has a token stored.
 * Skipped entirely in guest mode (auth disabled server-side).
 * On CodeUnauthenticated response, clears session and re-initiates auth flow.
 */
const authInterceptor: Interceptor = (next) => async (req) => {
  if (!guestMode) {
    try {
      const raw = localStorage.getItem('credentials');
      if (raw) {
        const creds = JSON.parse(raw);
        const token: string | undefined = creds?.id_token || creds?.access_token;
        if (token) {
          req.header.set('Authorization', `Bearer ${token}`);
        }
      }
    } catch { /* ignore parse errors */ }
  }

  try {
    return await next(req);
  } catch (err) {
    if (
      !guestMode &&
      err instanceof ConnectError &&
      err.code === Code.Unauthenticated &&
      onUnauthenticated
    ) {
      await onUnauthenticated();
      // Do not re-throw: onUnauthenticated initiates a page redirect (startAuthFlow).
      // Swallowing the error here prevents callers from briefly showing an error
      // message before the redirect completes.
      return new Promise<never>(() => {}); // pending promise — page will navigate away
    }
    throw err;
  }
};

const transport = createConnectTransport({
  baseUrl: BACKEND_URL || window.location.origin,
  useBinaryFormat: CONNECT_PROTOCOL !== 'json',
  interceptors: [authInterceptor],
});

/**
 * Typed ConnectRPC client for AuthService.
 * All methods are available as `authClient.methodName(request)`.
 */
export const authClient = createClient(AuthService, transport);

/**
 * Typed ConnectRPC client for IRSAService.
 */
export const irsaClient = createClient(IRSAService, transport);

/**
 * Typed ConnectRPC client for LivekitService.
 */
export const livekitClient = createClient(LivekitService, transport);
