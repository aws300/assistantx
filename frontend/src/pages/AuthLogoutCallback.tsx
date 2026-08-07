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
import { Component, onMount } from 'solid-js';
import { authStore, guestMode } from '@/stores/auth';
import { loadingStore } from '@/stores/loading';

/**
 * Handles the post-logout redirect from the OIDC provider.
 * Clears any remaining local state, then:
 * - In guest mode: redirects to home (no auth needed).
 * - In normal mode: re-initiates the OIDC authorization flow,
 *   restoring the page the user was on before logging out.
 */
const AuthLogoutCallback: Component = () => {
  onMount(async () => {
    loadingStore.showLoading();
    authStore.clearSession();

    if (guestMode) {
      loadingStore.hideLoading();
      window.location.href = '/';
      return;
    }

    // Restore the page the user was on before logout
    const returnUrl = sessionStorage.getItem('logout_return_url') || '/';
    sessionStorage.removeItem('logout_return_url');

    // Re-initiate auth flow with the original return URL encoded in state
    await authStore.startAuthFlow(returnUrl);
  });

  return <></>;
};

export default AuthLogoutCallback;
