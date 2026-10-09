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
import { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { Icon } from '@/components/ui/Icon';

const BackButton: Component = () => {
  return (
    <A
      href="/landing"
      class="fixed top-6 left-6 z-50 group"
      aria-label="Back to home"
    >
      <div class="glass-panel px-4 py-2 rounded-full flex items-center gap-2 hover:bg-white/90 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
        <Icon
          name="arrow_back"
          size="sm"
          class="text-[var(--primary)] group-hover:scale-110 transition-transform duration-300"
        />
        <span class="text-sm font-medium text-text-secondary hidden sm:inline">Back</span>
      </div>
    </A>
  );
};

export default BackButton;
