import { Component } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { homeStore } from '@/stores/homeStore';

const weatherIconMap: Record<string, string> = {
  '晴': 'wb_sunny',
  '多云': 'cloud',
  '阴': 'cloud',
  '小雨': 'rainy',
};

export const HomeStatusCard: Component = () => {
  const pm25Level = () => {
    const val = homeStore.state.info.pm25;
    if (val < 35) return { label: '优', color: 'text-green-600' };
    if (val < 75) return { label: '良', color: 'text-yellow-600' };
    return { label: '轻度污染', color: 'text-red-600' };
  };

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="home" size="sm" class="text-blue-600" />
        <span class="text-sm font-semibold text-gray-700">房屋状态</span>
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
          <div class="text-xs text-gray-500">室外温度</div>
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
            <div class="text-xs text-gray-500">室内温度</div>
          </div>
        </div>

        {/* Humidity */}
        <div class="flex items-center gap-3 p-3 rounded-lg bg-cyan-50">
          <div class="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Icon name="water_drop" size="sm" class="text-cyan-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{homeStore.state.info.humidity}%</div>
            <div class="text-xs text-gray-500">湿度</div>
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
