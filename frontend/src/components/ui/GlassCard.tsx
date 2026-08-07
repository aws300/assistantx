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
import { Component, JSX, Show, splitProps } from 'solid-js';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  title?: string;
  icon?: string;
  children: JSX.Element;
  class?: string;
  headerClass?: string;
}

export const GlassCard: Component<GlassCardProps> = (props) => {
  const [local, rest] = splitProps(props, ['title', 'icon', 'children', 'class', 'headerClass']);

  return (
    <div class={cn('liquid-glass rounded-2xl p-4', local.class)}>
      <Show when={local.title || local.icon}>
        <div class={cn(
          'flex items-center gap-2 mb-4 pb-2 border-b border-black/10',
          local.headerClass
        )}>
          <Show when={local.icon}>
            <Icon name={local.icon!} size="md" class="text-[var(--primary)]" />
          </Show>
          <Show when={local.title}>
            <h3 class="text-sm font-bold tracking-wider uppercase text-text-primary">
              {local.title}
            </h3>
          </Show>
        </div>
      </Show>
      {local.children}
    </div>
  );
};
