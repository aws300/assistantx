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
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { homeStore } from '@/stores/homeStore';

const weatherIconMap: Record<string, string> = {
  'Sunny': 'wb_sunny',
  'Cloudy': 'cloud',
  'Overcast': 'cloud',
  'Light rain': 'rainy',
};

export const HomeStatusCard: Component = () => {
  const pm25Level = () => {
    const val = homeStore.state.info.pm25;
    if (val < 35) return { label: 'Good', color: 'text-green-600' };
    if (val < 75) return { label: 'Moderate', color: 'text-yellow-600' };
    return { label: 'Unhealthy', color: 'text-red-600' };
  };

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="home" size="sm" class="text-blue-600" />
        <span class="text-sm font-semibold text-gray-700">Home Status</span>
      </div>

      {/* Weather and Outside Temp */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <Icon
            name={weatherIconMap[homeStore.state.info.weather] || 'wb_sunny'}
            size="lg"
            class="text-yellow-500"
          />
          <div>
            <div class="text-lg font-bold text-gray-800">{homeStore.state.info.weather}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold text-gray-800">
            {homeStore.state.info.outsideTemp}°
          </div>
          <div class="text-xs text-gray-500">Outside</div>
        </div>
      </div>

      {/* Status Grid */}
      <div class="grid grid-cols-2 gap-4">
        {/* Inside Temp */}
        <div class="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
          <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Icon name="thermostat" size="sm" class="text-blue-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{homeStore.state.info.insideTemp}°C</div>
            <div class="text-xs text-gray-500">Inside</div>
          </div>
        </div>

        {/* Humidity */}
        <div class="flex items-center gap-3 p-3 rounded-lg bg-cyan-50">
          <div class="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Icon name="water_drop" size="sm" class="text-cyan-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{homeStore.state.info.humidity}%</div>
            <div class="text-xs text-gray-500">Humidity</div>
          </div>
        </div>

        {/* PM2.5 */}
        <div class="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-green-50">
          <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <Icon name="air" size="sm" class="text-green-600" />
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">PM2.5</span>
              <span class={cn('text-lg font-bold', pm25Level().color)}>
                {homeStore.state.info.pm25}
              </span>
            </div>
            <div class="text-xs text-gray-500">{pm25Level().label}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
