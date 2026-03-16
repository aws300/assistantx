import { Component, Show } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { chargerStore } from '@/stores/chargerStore';

const statusLabels: Record<string, string> = {
  charging: '充电中',
  idle: '空闲',
  paused: '已暂停',
  completed: '已完成',
};

const statusColorClass: Record<string, string> = {
  charging: 'bg-green-100 text-green-700',
  idle: 'bg-gray-100 text-gray-600',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
};

export const ChargerStatusCard: Component = () => {
  const status = () => chargerStore.state.status.status;
  const isCharging = () => status() === 'charging';
  const isPaused = () => status() === 'paused';
  const canStart = () => status() === 'idle' || status() === 'completed';
  const canStop = () => isCharging() || isPaused();

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="ev_station" size="sm" class="text-green-600" />
        <span class="text-sm font-semibold text-gray-700">充电状态</span>
      </div>

      {/* Status Badge and Power */}
      <div class="flex items-center justify-between mb-4">
        <div>
          <span
            class={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
              statusColorClass[status()]
            )}
          >
            <Show when={isCharging()}>
              <span class="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
            </Show>
            {statusLabels[status()]}
          </span>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold text-blue-600">
            {chargerStore.state.electrical.power}
            <span class="text-lg ml-1">kW</span>
          </div>
          <div class="text-xs text-gray-500">实时功率</div>
        </div>
      </div>

      {/* Battery SOC Progress */}
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <Icon name="battery_charging_full" size="sm" class="text-green-600" />
            <span class="text-sm font-medium text-gray-700">电池电量</span>
          </div>
          <div class="text-sm">
            <span class="font-bold text-gray-800">{chargerStore.state.status.soc}%</span>
            <span class="text-gray-500"> / {chargerStore.state.status.targetSoc}%</span>
          </div>
        </div>
        <div class="relative h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="absolute left-0 top-0 h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
            style={{ width: `${chargerStore.state.status.soc}%` }}
          />
          {/* Target marker */}
          <div
            class="absolute top-0 w-0.5 h-full bg-blue-600"
            style={{ left: `${chargerStore.state.status.targetSoc}%` }}
          />
        </div>
        <div class="flex justify-between mt-1 text-xs text-gray-500">
          <span>0%</span>
          <span>目标: {chargerStore.state.status.targetSoc}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
          <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Icon name="schedule" size="sm" class="text-blue-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">
              {chargerStore.state.battery.estimatedTime > 0
                ? `${chargerStore.state.battery.estimatedTime}分钟`
                : '--'}
            </div>
            <div class="text-xs text-gray-500">预计剩余</div>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-amber-50">
          <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Icon name="payments" size="sm" class="text-amber-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">
              ¥{chargerStore.state.billing.currentCost.toFixed(1)}
            </div>
            <div class="text-xs text-gray-500">当前费用</div>
          </div>
        </div>
      </div>

      {/* Charging Info */}
      <div class="flex items-center justify-between text-sm text-gray-600 mb-4 px-1">
        <span>已充 {chargerStore.state.electrical.totalEnergy.toFixed(1)} kWh</span>
        <span>电价 ¥{chargerStore.state.billing.rate}/kWh</span>
      </div>

      {/* Control Buttons */}
      <div class="flex gap-2">
        <Show when={canStart()}>
          <button
            onClick={() => chargerStore.startCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors"
          >
            <Icon name="play_arrow" size="sm" />
            开始充电
          </button>
        </Show>

        <Show when={isCharging()}>
          <button
            onClick={() => chargerStore.pauseCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
          >
            <Icon name="pause" size="sm" />
            暂停
          </button>
          <button
            onClick={() => chargerStore.stopCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            <Icon name="stop" size="sm" />
            停止
          </button>
        </Show>

        <Show when={isPaused()}>
          <button
            onClick={() => chargerStore.resumeCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors"
          >
            <Icon name="play_arrow" size="sm" />
            继续
          </button>
          <button
            onClick={() => chargerStore.stopCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            <Icon name="stop" size="sm" />
            停止
          </button>
        </Show>
      </div>
    </div>
  );
};
