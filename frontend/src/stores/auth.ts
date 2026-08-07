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
import { createSignal } from 'solid-js';
import { authClient, setUnauthenticatedHandler } from '../api/client';

const CREDENTIALS_KEY = 'credentials';
const PKCE_KEY = 'pkce_verifier';

/**
 * Guest mode: the backend has no OIDC provider configured.
 * In this mode the backend returns sub="guest" for every GetUserInfo call
 * and rejects Authorize/Token/Logout with Unimplemented.
 * The frontend skips the auth flow and never attaches Bearer tokens.
 */
export let guestMode = false;

interface Credentials {
  token_type: string;
  access_token: string;
  id_token?: string;       // present in new sessions; absent in old stored credentials
  refresh_token: string;
  expires_in: number;
  sub: string;
  expires_at: string;
}

export interface UserInfo {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCredentials(creds: Credentials) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
}

function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
  sessionStorage.removeItem(PKCE_KEY);
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isTokenExpired(creds: Credentials | null): boolean {
  if (!creds?.expires_at) return true;
  const expiresAt = new Date(creds.expires_at).getTime();
  return Date.now() > expiresAt - 5 * 60 * 1000;
}

// Fetch user info from backend by sending the id_token as Bearer.
// The auth interceptor in client.ts reads from localStorage credentials
// automatically, so no extra header plumbing is needed here.
async function fetchUserInfo(idToken: string): Promise<UserInfo | null> {
  // Temporarily store the token so the interceptor can pick it up.
  // (The interceptor reads from localStorage 'credentials', which is already
  //  set at the point getUserInfo is called — so this is a no-op in practice.)
  try {
    // The interceptor uses id_token from credentials in localStorage.
    // When called post-login, credentials are already saved.
    const resp = await authClient.getUserInfo({});
    return {
      sub: resp.sub || '',
      name: resp.name || '',
      email: resp.email || '',
      picture: resp.picture || '',
    };
  } catch { return null; }
}

function createAuthStore() {
  const [credentials, setCredentials] = createSignal<Credentials | null>(loadCredentials());
  // userInfo is never cached — always fetched live from JWT
  const [userInfo, setUserInfo] = createSignal<UserInfo | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);

  const isAuthenticated = () => {
    const creds = credentials();
    return creds !== null && !isTokenExpired(creds);
  };

  const getAccessToken = async (): Promise<string | null> => {
    let creds = credentials();
    if (!creds) return null;
    if (isTokenExpired(creds) && creds.refresh_token) {
      try {
        await refreshToken();
        creds = credentials();
      } catch {
        clearCredentials();
        setCredentials(null);
        return null;
      }
    }
    return creds?.access_token || null;
  };

  const startAuthFlow = async (returnUrl?: string) => {
    const verifier = generateRandomString(64);
    sessionStorage.setItem(PKCE_KEY, verifier);
    const challenge = await generateCodeChallenge(verifier);
    const csrf = generateRandomString(32);

    // Encode returnUrl into state: "{csrf}:{base64(returnUrl)}"
    // This survives the IdP round-trip without relying solely on sessionStorage.
    const url = returnUrl || (window.location.pathname + window.location.search);
    const encodedReturn = btoa(encodeURIComponent(url));
    const state = `${csrf}:${encodedReturn}`;

    sessionStorage.setItem('oauth_state', csrf);
    // Fallback: also store in sessionStorage in case state is dropped by IdP
    sessionStorage.setItem('oauth_return_url', url);

    const redirectUri = `${window.location.origin}/auth/oidc/callback`;
    const resp = await authClient.authorize({ redirectUri, codeChallenge: challenge, state });
    if (resp.authorizeUrl) {
      window.location.href = resp.authorizeUrl;
    }
  };

  const handleCallback = async (code: string, state: string): Promise<boolean> => {
    // state format: "{csrf}:{base64(returnUrl)}" or legacy plain csrf string
    const colonIdx = state.indexOf(':');
    const csrf = colonIdx !== -1 ? state.slice(0, colonIdx) : state;
    const encodedReturn = colonIdx !== -1 ? state.slice(colonIdx + 1) : '';

    const savedCsrf = sessionStorage.getItem('oauth_state');
    if (csrf !== savedCsrf) {
      console.error('OAuth state mismatch');
      return false;
    }
    const verifier = sessionStorage.getItem(PKCE_KEY);
    if (!verifier) {
      console.error('No PKCE verifier found');
      return false;
    }

    // Decode return URL from state; fallback to sessionStorage
    let returnUrl = '/';
    if (encodedReturn) {
      try {
        returnUrl = decodeURIComponent(atob(encodedReturn));
      } catch { /* fall through to sessionStorage fallback */ }
    }
    if (returnUrl === '/') {
      returnUrl = sessionStorage.getItem('oauth_return_url') || '/';
    }

    const redirectUri = `${window.location.origin}/auth/oidc/callback`;

    let data;
    try {
      data = await authClient.token({
        grantType: 'authorization_code',
        code,
        redirectUri,
        codeVerifier: verifier,
      });
    } catch { return false; }

    const creds: Credentials = {
      token_type: data.tokenType || 'Bearer',
      access_token: data.accessToken || '',
      id_token: data.idToken || '',
      refresh_token: data.refreshToken || '',
      expires_in: data.expiresIn || 7200,
      sub: data.sub || '',
      expires_at: new Date(Date.now() + (data.expiresIn || 7200) * 1000).toISOString(),
    };

    saveCredentials(creds);
    setCredentials(creds);
    sessionStorage.removeItem(PKCE_KEY);
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_return_url');

    const info = await fetchUserInfo(creds.id_token || creds.access_token);
    if (info) setUserInfo(info);

    // Store resolved returnUrl for AuthCallback to use
    sessionStorage.setItem('oauth_return_url', returnUrl);

    return true;
  };

  const refreshToken = async () => {
    const creds = credentials();
    if (!creds?.refresh_token) throw new Error('No refresh token');

    let data;
    try {
      data = await authClient.token({
        grantType: 'refresh_token',
        refreshToken: creds.refresh_token,
      });
    } catch { throw new Error('Refresh failed'); }

    const newCreds: Credentials = {
      token_type: data.tokenType || 'Bearer',
      access_token: data.accessToken || '',
      id_token: data.idToken || creds.id_token,
      refresh_token: data.refreshToken || creds.refresh_token,
      expires_in: data.expiresIn || 7200,
      sub: data.sub || creds.sub,
      expires_at: new Date(Date.now() + (data.expiresIn || 7200) * 1000).toISOString(),
    };
    saveCredentials(newCreds);
    setCredentials(newCreds);
  };

  const logout = async () => {
    // Guest mode: no OIDC session to terminate
    if (guestMode) {
      window.location.href = '/';
      return;
    }
    // Save current page so we can return after re-login post-logout
    sessionStorage.setItem('logout_return_url', window.location.pathname + window.location.search);

    const creds = credentials();
    const idToken = creds?.id_token || creds?.access_token || '';
    clearCredentials();
    setCredentials(null);
    setUserInfo(null);
    try {
      const redirectUri = window.location.origin + '/auth/oidc/logout';
      const resp = await authClient.logout({ redirectUri, idTokenHint: idToken });
      if (resp.logoutUrl) {
        window.location.href = resp.logoutUrl;
        return;
      }
    } catch { /* fall through */ }
    window.location.href = '/';
  };

  const ensureAuthenticated = async (): Promise<boolean> => {
    // Probe the backend: if it returns sub="guest", enter guest mode
    // (auth disabled server-side). Skip OIDC flow entirely.
    try {
      const probe = await authClient.getUserInfo({});
      if (probe.sub === 'guest') {
        guestMode = true;
        setUserInfo({ sub: 'guest', name: '', email: '', picture: '' });
        return true;
      }
    } catch { /* not guest mode, fall through to normal auth */ }

    const creds = credentials();
    if (creds && !isTokenExpired(creds)) {
      // Always fetch userinfo live via id_token (JWT-only, no external endpoint).
      // The auth interceptor will attach the Bearer token from localStorage.
      const info = await fetchUserInfo(creds.id_token || creds.access_token);
      if (info) setUserInfo(info);
      return true;
    }
    if (creds?.refresh_token) {
      try {
        await refreshToken();
        const freshCreds = credentials();
        if (freshCreds) {
          const info = await fetchUserInfo(freshCreds.id_token || freshCreds.access_token);
          if (info) setUserInfo(info);
        }
        return true;
      } catch { /* fall through */ }
    }
    return false;
  };

  const clearSession = () => {
    clearCredentials();
    setCredentials(null);
    setUserInfo(null);
  };

  return {
    credentials,
    userInfo,
    isAuthenticated,
    isLoading,
    setIsLoading,
    getAccessToken,
    startAuthFlow,
    handleCallback,
    refreshToken,
    logout,
    clearSession,
    ensureAuthenticated,
  };
}

export const authStore = createAuthStore();

// Register the unauthenticated handler after store creation to avoid circular imports.
// When the backend returns CodeUnauthenticated, clear session and re-initiate OIDC flow.
setUnauthenticatedHandler(async () => {
  if (!guestMode) {
    authStore.clearSession();
    await authStore.startAuthFlow();
  }
});
