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

const AMBIENT_COLORS = [
  { color: '#3B82F6', name: 'Blue' },
  { color: '#EF4444', name: 'Red' },
  { color: '#22C55E', name: 'Green' },
  { color: '#F97316', name: 'Orange' },
  { color: '#A855F7', name: 'Purple' },
  { color: '#EC4899', name: 'Pink' },
  { color: '#06B6D4', name: 'Cyan' },
  { color: '#6B7280', name: 'White' },
];

export const LightingControl: Component = () => {
  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="light" size="sm" class="text-yellow-600" />
        <span class="text-sm font-semibold text-gray-700">Lighting</span>
      </div>

      {/* Interior Light Toggle + Brightness */}
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Icon name="wb_sunny" size="xs" class="text-gray-500" />
            <span class="text-sm text-gray-600">Interior Light</span>
          </div>
          <button
            class={cn(
              'w-12 h-6 rounded-full transition-all duration-300 relative',
              vehicleStore.state.lighting.interior.on ? 'bg-yellow-400' : 'bg-gray-300'
            )}
            onClick={() => vehicleStore.setInteriorLight(!vehicleStore.state.lighting.interior.on)}
          >
            <div
              class={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300',
                vehicleStore.state.lighting.interior.on ? 'left-7' : 'left-1'
              )}
            />
          </button>
        </div>
        <div class="flex items-center gap-3">
          <Icon name="brightness_low" size="xs" class="text-gray-400" />
          <input
            type="range"
            min="0"
            max="100"
            value={vehicleStore.state.lighting.interior.brightness}
            onInput={(e) => vehicleStore.setInteriorBrightness(parseInt(e.currentTarget.value))}
            class="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-yellow-500"
          />
          <span class="text-xs text-gray-500 w-8 text-right">
            {vehicleStore.state.lighting.interior.brightness}%
          </span>
        </div>
      </div>

      {/* Ambient Light */}
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div
              class="w-4 h-4 rounded-full border border-gray-200"
              style={{
                'background-color': vehicleStore.state.lighting.ambient.color,
                'box-shadow': `0 0 10px ${vehicleStore.state.lighting.ambient.color}`,
              }}
            />
            <span class="text-sm text-gray-600">Ambient Light</span>
          </div>
          <span class="text-xs text-gray-500">{vehicleStore.state.lighting.ambient.brightness}%</span>
        </div>

        {/* Color Picker */}
        <div class="flex gap-2 mb-4">
          <For each={AMBIENT_COLORS}>
            {(item) => (
              <button
                class={cn(
                  'w-8 h-8 rounded-full transition-all duration-200 border-2',
                  vehicleStore.state.lighting.ambient.color === item.color
                    ? 'border-gray-800 scale-110'
                    : 'border-transparent hover:scale-105'
                )}
                style={{
                  'background-color': item.color,
                  'box-shadow':
                    vehicleStore.state.lighting.ambient.color === item.color
                      ? `0 0 15px ${item.color}`
                      : 'none',
                }}
                title={item.name}
                onClick={() => vehicleStore.setAmbientColor(item.color)}
              />
            )}
          </For>
        </div>

        {/* Brightness Slider */}
        <div class="flex items-center gap-3">
          <Icon name="brightness_low" size="xs" class="text-gray-400" />
          <input
            type="range"
            min="0"
            max="100"
            value={vehicleStore.state.lighting.ambient.brightness}
            onInput={(e) => vehicleStore.setAmbientBrightness(parseInt(e.currentTarget.value))}
            class="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <span class="text-xs text-gray-500 w-8 text-right">
            {vehicleStore.state.lighting.ambient.brightness}%
          </span>
        </div>
      </div>

      {/* Reading Light */}
      <div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Icon name="menu_book" size="xs" class="text-gray-500" />
            <span class="text-sm text-gray-600">Reading Light</span>
          </div>
          <button
            class={cn(
              'w-12 h-6 rounded-full transition-all duration-300 relative',
              vehicleStore.state.lighting.reading.on ? 'bg-yellow-400' : 'bg-gray-300'
            )}
            onClick={() => vehicleStore.setReadingLight(!vehicleStore.state.lighting.reading.on)}
          >
            <div
              class={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300',
                vehicleStore.state.lighting.reading.on ? 'left-7' : 'left-1'
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
