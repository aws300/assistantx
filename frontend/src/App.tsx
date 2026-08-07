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
import { Component, lazy, onMount, Show } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { themeStore } from '@/stores/theme';
import { loadingStore } from '@/stores/loading';
import { authStore } from '@/stores/auth';
import { Loading } from '@/components/Loading';

const Home = lazy(() => import('@/pages/Home'));
const Landing = lazy(() => import('@/pages/Landing'));
const Cockpit = lazy(() => import('@/pages/Cockpit'));
const SmartHome = lazy(() => import('@/pages/SmartHome'));
const Charger = lazy(() => import('@/pages/Charger'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const AuthLogoutCallback = lazy(() => import('@/pages/AuthLogoutCallback'));

const App: Component = () => {
  const checkAuthentication = async (): Promise<boolean> => {
    if (window.location.pathname.startsWith('/auth/')) {
      return true;
    }
    const hasAuth = await authStore.ensureAuthenticated();
    if (!hasAuth) {
      await authStore.startAuthFlow();
      return false;
    }
    return true;
  };

  onMount(async () => {
    try {
      themeStore.initTheme();
      loadingStore.showLoading();

      if (window.location.pathname.startsWith('/auth/')) {
        return;
      }

      const authSuccess = await checkAuthentication();
      if (!authSuccess) {
        return;
      }
    } catch {
      // Silently ignore initialization errors
    } finally {
      if (!window.location.pathname.startsWith('/auth/')) {
        loadingStore.hideLoading();
      }
    }
  });

  return (
    <>
      <Show when={loadingStore.isLoading()}>
        <Loading fullscreen />
      </Show>

      <Router>
        <Route path="/" component={Landing} />
        <Route path="/landing" component={Landing} />
        <Route path="/car" component={Cockpit} />
        <Route path="/home" component={SmartHome} />
        <Route path="/charger" component={Charger} />
        <Route path="/settings" component={Home} />
        <Route path="/auth/oidc/callback" component={AuthCallback} />
        <Route path="/auth/oidc/logout" component={AuthLogoutCallback} />
        <Route path="*" component={Landing} />
      </Router>
    </>
  );
};

export default App;
