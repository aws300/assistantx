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

function getTemperatureColor(temp: number, maxSafe: number): string {
  const ratio = temp / maxSafe;
  if (ratio < 0.6) return 'text-green-600 bg-green-100';
  if (ratio < 0.8) return 'text-yellow-600 bg-yellow-100';
  return 'text-red-600 bg-red-100';
}

function getTemperatureBarColor(temp: number, maxSafe: number): string {
  const ratio = temp / maxSafe;
  if (ratio < 0.6) return 'from-green-400 to-green-600';
  if (ratio < 0.8) return 'from-yellow-400 to-yellow-600';
  return 'from-red-400 to-red-600';
}

interface TempItemProps {
  icon: string;
  label: string;
  value: number;
  maxSafe: number;
  unit?: string;
}

const TempItem: Component<TempItemProps> = (props) => {
  const unit = () => props.unit ?? '°C';
  const percent = () => Math.min(100, (props.value / props.maxSafe) * 100);
  const colorClass = () => getTemperatureColor(props.value, props.maxSafe);
  const barColorClass = () => getTemperatureBarColor(props.value, props.maxSafe);

  return (
    <div class="p-3 rounded-lg bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <div class={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorClass())}>
            <Icon name={props.icon} size="xs" />
          </div>
          <span class="text-sm font-medium text-gray-700">{props.label}</span>
        </div>
        <span class="text-lg font-bold text-gray-800">
          {props.value}
          {unit()}
        </span>
      </div>
      <div class="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          class={cn(
            'absolute left-0 top-0 h-full bg-gradient-to-r transition-all duration-300',
            barColorClass()
          )}
          style={{ width: `${percent()}%` }}
        />
      </div>
      <div class="flex justify-between mt-1 text-xs text-gray-400">
        <span>
          0{unit()}
        </span>
        <span>
          安全阈值 {props.maxSafe}
          {unit()}
        </span>
      </div>
    </div>
  );
};

export const EnvironmentCard: Component = () => {
  const cooling = () => {
    const t = chargerStore.state.temperature;
    const maxTemp = Math.max(t.connector / 85, t.module / 70, t.ambient / 45);
    if (maxTemp < 0.6) return { label: '正常', color: 'text-green-600' };
    if (maxTemp < 0.8) return { label: '偏高', color: 'text-yellow-600' };
    return { label: '过高', color: 'text-red-600' };
  };

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="thermostat" size="sm" class="text-red-600" />
        <span class="text-sm font-semibold text-gray-700">温度监测</span>
      </div>

      <div class="space-y-4">
        <TempItem
          icon="thermostat"
          label="枪头温度"
          value={chargerStore.state.temperature.connector}
          maxSafe={85}
        />

        <TempItem
          icon="memory"
          label="模块温度"
          value={chargerStore.state.temperature.module}
          maxSafe={70}
        />

        <TempItem
          icon="wb_sunny"
          label="环境温度"
          value={chargerStore.state.temperature.ambient}
          maxSafe={45}
        />
      </div>

      {/* Temperature Summary */}
      <div class="mt-4 p-3 rounded-lg bg-blue-50">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">系统散热状态</span>
          <span class={cn('font-medium', cooling().color)}>{cooling().label}</span>
        </div>
      </div>
    </div>
  );
};
