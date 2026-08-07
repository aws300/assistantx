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
import { Component, For } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { vehicleStore } from '@/stores/vehicleStore';

interface WindowButtonProps {
  label: string;
  index: number;
  position: number;
}

const WindowButton: Component<WindowButtonProps> = (props) => {
  const isOpen = () => props.position > 0;

  return (
    <div class="flex flex-col items-center gap-2">
      <div
        class={cn(
          'w-12 h-16 rounded-lg border-2 transition-all duration-300 relative overflow-hidden',
          isOpen() ? 'border-blue-500' : 'border-gray-300'
        )}
      >
        {/* Window glass */}
        <div
          class="absolute bottom-0 left-0 right-0 bg-blue-400/30 transition-all duration-300"
          style={{ height: `${100 - props.position}%` }}
        />
        {isOpen() && (
          <div class="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-blue-500 rounded-full" />
        )}
      </div>
      <span class="text-xs text-gray-500">{props.label}</span>
      <div class="flex items-center gap-1">
        <button
          onClick={() => vehicleStore.setWindowPosition(props.index, Math.min(100, props.position + 25))}
          class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors flex items-center justify-center"
        >
          <Icon name="arrow_drop_down" size="xs" />
        </button>
        <button
          onClick={() => vehicleStore.setWindowPosition(props.index, Math.max(0, props.position - 25))}
          class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors flex items-center justify-center"
        >
          <Icon name="arrow_drop_up" size="xs" />
        </button>
      </div>
    </div>
  );
};

const windowLabels = ['左前', '右前', '左后', '右后', '天窗'];

export const WindowControl: Component = () => {
  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <Icon name="window" size="sm" class="text-blue-600" />
          <span class="text-sm font-semibold text-gray-700">车窗控制</span>
        </div>
        <button
          class="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          onClick={() => vehicleStore.setAllWindows(0)}
        >
          全关
        </button>
      </div>

      {/* Car top view with windows */}
      <div class="flex justify-center gap-8 py-4">
        {/* Left side */}
        <div class="flex flex-col gap-4">
          <WindowButton label={windowLabels[0]} index={0} position={vehicleStore.state.windows[0].position} />
          <WindowButton label={windowLabels[2]} index={2} position={vehicleStore.state.windows[2].position} />
        </div>

        {/* Center - Sunroof */}
        <div class="flex flex-col items-center justify-center">
          <div
            class={cn(
              'w-16 h-24 rounded-xl border-2 transition-all duration-300 relative overflow-hidden',
              vehicleStore.state.windows[4].position > 0 ? 'border-blue-500' : 'border-gray-300'
            )}
          >
            <div
              class="absolute bottom-0 left-0 right-0 bg-blue-400/30 transition-all duration-300"
              style={{ height: `${100 - vehicleStore.state.windows[4].position}%` }}
            />
          </div>
          <span class="text-xs text-gray-500 mt-2">天窗</span>
          <div class="flex gap-1 mt-2">
            <button
              onClick={() =>
                vehicleStore.setWindowPosition(4, Math.min(100, vehicleStore.state.windows[4].position + 25))
              }
              class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors flex items-center justify-center"
            >
              <Icon name="arrow_drop_down" size="xs" />
            </button>
            <button
              onClick={() =>
                vehicleStore.setWindowPosition(4, Math.max(0, vehicleStore.state.windows[4].position - 25))
              }
              class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors flex items-center justify-center"
            >
              <Icon name="arrow_drop_up" size="xs" />
            </button>
          </div>
        </div>

        {/* Right side */}
        <div class="flex flex-col gap-4">
          <WindowButton label={windowLabels[1]} index={1} position={vehicleStore.state.windows[1].position} />
          <WindowButton label={windowLabels[3]} index={3} position={vehicleStore.state.windows[3].position} />
        </div>
      </div>

      {/* Position sliders */}
      <div class="mt-4 space-y-2">
        <For each={vehicleStore.state.windows}>
          {(window, i) => (
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-500 w-8">{windowLabels[i()]}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={window.position}
                onInput={(e) => vehicleStore.setWindowPosition(i(), parseInt(e.currentTarget.value))}
                class="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-500"
              />
              <span class="text-xs text-gray-500 w-8 text-right">{window.position}%</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
