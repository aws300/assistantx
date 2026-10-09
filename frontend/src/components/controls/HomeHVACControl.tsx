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
import { homeStore, HvacMode, HomeFanSpeed } from '@/stores/homeStore';

const modeOptions: { value: HvacMode; label: string; icon: string }[] = [
  { value: 'cool', label: 'Cool', icon: 'ac_unit' },
  { value: 'heat', label: 'Heat', icon: 'wb_sunny' },
  { value: 'auto', label: 'Auto', icon: 'hdr_auto' },
  { value: 'fan', label: 'Fan', icon: 'air' },
  { value: 'dry', label: 'Dry', icon: 'water_drop' },
];

const fanOptions: { value: HomeFanSpeed; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'auto', label: 'Auto' },
];

export const HomeHVACControl: Component = () => {
  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <Icon name="thermostat" size="sm" class="text-blue-600" />
          <span class="text-sm font-semibold text-gray-700">Climate Control</span>
        </div>
        <button
          class={cn(
            'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
            homeStore.state.hvac.power
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
          onClick={() => homeStore.setHvacPower(!homeStore.state.hvac.power)}
        >
          <Icon name="power_settings_new" size="xs" />
          {homeStore.state.hvac.power ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Temperature Display */}
      <div
        class={cn(
          'flex items-center justify-center mb-6 transition-opacity',
          homeStore.state.hvac.power ? 'opacity-100' : 'opacity-50'
        )}
      >
        <div class="text-center">
          <div class="text-5xl font-bold text-gray-800">
            {homeStore.state.hvac.targetTemp}
            <span class="text-2xl text-gray-400">°C</span>
          </div>
        </div>
      </div>

      {/* Controls - disabled when power off */}
      <div
        class={cn(
          'transition-opacity',
          homeStore.state.hvac.power ? 'opacity-100' : 'opacity-50 pointer-events-none'
        )}
      >
        {/* Temperature Slider */}
        <div class="flex items-center justify-center gap-6 mb-6">
          <button
            class="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
            onClick={() => homeStore.setTargetTemp(homeStore.state.hvac.targetTemp - 1)}
          >
            <Icon name="remove" size="sm" />
          </button>
          <input
            type="range"
            min="16"
            max="30"
            step="1"
            value={homeStore.state.hvac.targetTemp}
            onInput={(e) => homeStore.setTargetTemp(parseInt(e.currentTarget.value))}
            class="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <button
            class="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
            onClick={() => homeStore.setTargetTemp(homeStore.state.hvac.targetTemp + 1)}
          >
            <Icon name="add" size="sm" />
          </button>
        </div>

        {/* Mode Selection */}
        <div class="mb-4">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="tune" size="xs" class="text-gray-500" />
            <span class="text-sm text-gray-500">Mode</span>
          </div>
          <div class="flex gap-2">
            <For each={modeOptions}>
              {(mode) => (
                <button
                  class={cn(
                    'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                    homeStore.state.hvac.mode === mode.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                  onClick={() => homeStore.setHvacMode(mode.value)}
                >
                  <Icon name={mode.icon} size="xs" />
                  {mode.label}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Fan Speed */}
        <div>
          <div class="flex items-center gap-2 mb-2">
            <Icon name="air" size="xs" class="text-gray-500" />
            <span class="text-sm text-gray-500">Fan Speed</span>
          </div>
          <div class="flex gap-2">
            <For each={fanOptions}>
              {(fan) => (
                <button
                  class={cn(
                    'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200',
                    homeStore.state.hvac.fanSpeed === fan.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                  onClick={() => homeStore.setFanSpeed(fan.value)}
                >
                  {fan.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
