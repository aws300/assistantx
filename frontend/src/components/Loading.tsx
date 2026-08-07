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
import { Component, Show } from 'solid-js';

interface LoadingProps {
  fullscreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-[30px] h-[30px]',
  lg: 'w-10 h-10',
};

export const Loading: Component<LoadingProps> = (props) => {
  const LoadingSpinner = () => (
    <div
      class={`${sizeClasses[props.size || 'md']} rounded-full box-border shadow-[0_-10px_0_13px_rgba(255,255,255,0.6)_inset] animate-spin`}
    />
  );

  return (
    <Show
      when={props.fullscreen}
      fallback={<LoadingSpinner />}
    >
      <div class="fixed inset-0 z-[99] flex items-center justify-center bg-black/30">
        <LoadingSpinner />
      </div>
    </Show>
  );
};

export default Loading;
