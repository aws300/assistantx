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
import { chargerStore } from '@/stores/chargerStore';

export const ChargingDataCard: Component = () => {
  const maxPower = 120; // assumed max power for percentage calculation

  const powerPercent = () => Math.min(100, (chargerStore.state.electrical.power / maxPower) * 100);

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="bolt" size="sm" class="text-blue-600" />
        <span class="text-sm font-semibold text-gray-700">Electrical Data</span>
      </div>

      {/* Power Gauge */}
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-gray-700">Live Power</span>
          <span class="text-sm text-gray-500">Max {maxPower} kW</span>
        </div>
        <div class="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300"
            style={{ width: `${powerPercent()}%` }}
          />
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-2xl font-bold text-blue-600">
            {chargerStore.state.electrical.power} kW
          </span>
          <span class="text-sm text-gray-500">{powerPercent().toFixed(0)}%</span>
        </div>
      </div>

      {/* Voltage & Current Grid */}
      <div class="grid grid-cols-2 gap-4 mb-4">
        {/* Voltage */}
        <div class="p-3 rounded-lg bg-purple-50">
          <div class="flex items-center gap-2 mb-1">
            <Icon name="speed" size="xs" class="text-purple-600" />
            <span class="text-xs text-gray-600">Voltage</span>
          </div>
          <div class="text-xl font-bold text-gray-800">
            {chargerStore.state.electrical.voltage} V
          </div>
        </div>

        {/* Current */}
        <div class="p-3 rounded-lg bg-green-50">
          <div class="flex items-center gap-2 mb-1">
            <Icon name="bolt" size="xs" class="text-green-600" />
            <span class="text-xs text-gray-600">Current</span>
          </div>
          <div class="text-xl font-bold text-gray-800">
            {chargerStore.state.electrical.current} A
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div class="grid grid-cols-2 gap-3">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
          <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Icon name="electric_meter" size="sm" class="text-blue-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">
              {chargerStore.state.electrical.power.toFixed(1)}
            </div>
            <div class="text-xs text-gray-500">Power kW</div>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-cyan-50">
          <div class="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Icon name="bar_chart" size="sm" class="text-cyan-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">
              {chargerStore.state.electrical.totalEnergy.toFixed(1)}
            </div>
            <div class="text-xs text-gray-500">Total Energy kWh</div>
          </div>
        </div>
      </div>
    </div>
  );
};
