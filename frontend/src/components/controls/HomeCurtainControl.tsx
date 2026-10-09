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
import { homeStore } from '@/stores/homeStore';

const quickPositions = [0, 25, 50, 75, 100];

export const HomeCurtainControl: Component = () => {
  const positionLabel = () => {
    const pos = homeStore.state.curtainPosition;
    if (pos === 0) return 'Closed';
    if (pos === 100) return 'Fully Open';
    return 'Partly Open';
  };

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <Icon name="blinds" size="sm" class="text-orange-600" />
          <span class="text-sm font-semibold text-gray-700">Curtains</span>
        </div>
        <div class="flex gap-2">
          <button
            class={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
              homeStore.state.curtainPosition > 50
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            onClick={() => homeStore.setCurtainPosition(100)}
          >
            All On
          </button>
          <button
            class={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
              homeStore.state.curtainPosition < 50
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            onClick={() => homeStore.setCurtainPosition(0)}
          >
            All Off
          </button>
        </div>
      </div>

      {/* Curtain Visual */}
      <div class="flex justify-center mb-6">
        <div class="relative w-48 h-32 border-4 border-gray-300 rounded-lg overflow-hidden bg-gradient-to-b from-blue-200 to-blue-100">
          {/* Window frame */}
          <div class="absolute inset-0 border-2 border-gray-200 rounded" />

          {/* Curtain left */}
          <div
            class="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-300 to-orange-200 transition-all duration-500 shadow-lg"
            style={{ width: `${(100 - homeStore.state.curtainPosition) / 2}%` }}
          >
            <div class="absolute inset-0 opacity-30">
              <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                {(i) => (
                  <div
                    class="absolute top-0 h-full w-px bg-orange-400"
                    style={{ left: `${i * 12.5}%` }}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Curtain right */}
          <div
            class="absolute top-0 right-0 h-full bg-gradient-to-l from-orange-300 to-orange-200 transition-all duration-500 shadow-lg"
            style={{ width: `${(100 - homeStore.state.curtainPosition) / 2}%` }}
          >
            <div class="absolute inset-0 opacity-30">
              <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                {(i) => (
                  <div
                    class="absolute top-0 h-full w-px bg-orange-400"
                    style={{ left: `${i * 12.5}%` }}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Sun indicator */}
          {homeStore.state.curtainPosition > 20 && (
            <div
              class="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-yellow-300 transition-opacity duration-500"
              style={{ opacity: homeStore.state.curtainPosition / 200 }}
            />
          )}
        </div>
      </div>

      {/* Position Display */}
      <div class="text-center mb-4">
        <span class="text-2xl font-bold text-gray-800">{homeStore.state.curtainPosition}%</span>
        <span class="text-sm text-gray-500 ml-2">{positionLabel()}</span>
      </div>

      {/* Position Slider */}
      <div class="mb-4">
        <div class="flex items-center gap-2 mb-1">
          <Icon name="tune" size="xs" class="text-gray-500" />
          <span class="text-xs text-gray-500">Openness</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="10"
          value={homeStore.state.curtainPosition}
          onInput={(e) => homeStore.setCurtainPosition(parseInt(e.currentTarget.value))}
          class="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-orange-500"
        />
      </div>

      {/* Quick Position Buttons */}
      <div class="flex gap-2">
        <For each={quickPositions}>
          {(pos) => (
            <button
              class={cn(
                'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200',
                homeStore.state.curtainPosition === pos
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
              onClick={() => homeStore.setCurtainPosition(pos)}
            >
              {pos}%
            </button>
          )}
        </For>
      </div>
    </div>
  );
};
