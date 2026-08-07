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
import { useNavigate, useSearchParams } from '@solidjs/router';
import { authStore } from '@/stores/auth';
import { loadingStore } from '@/stores/loading';

const AuthCallback: Component = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  onMount(async () => {
    loadingStore.showLoading();

    const code = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;
    const state = Array.isArray(searchParams.state) ? searchParams.state[0] : searchParams.state;

    if (!code || !state) {
      loadingStore.hideLoading();
      navigate('/');
      return;
    }

    const success = await authStore.handleCallback(code as string, state as string);
    loadingStore.hideLoading();

    if (success) {
      const returnUrl = sessionStorage.getItem('oauth_return_url') || '/';
      sessionStorage.removeItem('oauth_return_url');
      navigate(returnUrl);
    } else {
      navigate('/');
    }
  });

  return <></>;
};

export default AuthCallback;
