import { Component, For } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { vehicleStore, FanSpeed } from '@/stores/vehicleStore';

const fanSpeeds: { value: FanSpeed; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: '1' },
  { value: 'medium', label: '2' },
  { value: 'high', label: '3' },
];

export const HVACControl: Component = () => {
  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <Icon name="thermostat" size="sm" class="text-blue-600" />
          <span class="text-sm font-semibold text-gray-700">空调控制</span>
        </div>
        <button
          class={cn(
            'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
            vehicleStore.state.hvac.acOn
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
          onClick={() => vehicleStore.setAcOn(!vehicleStore.state.hvac.acOn)}
        >
          <Icon name="ac_unit" size="xs" />
          {vehicleStore.state.hvac.acOn ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Temperature Display */}
      <div class="flex items-center justify-center mb-6">
        <div class="text-center">
          <div class="text-5xl font-bold text-gray-800">
            {vehicleStore.state.hvac.temperature}
            <span class="text-2xl text-gray-400">°C</span>
          </div>
        </div>
      </div>

      {/* Temperature Adjust */}
      <div class="flex items-center justify-center gap-6 mb-6">
        <button
          class="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
          onClick={() => vehicleStore.setTemperature(vehicleStore.state.hvac.temperature - 0.5)}
        >
          <Icon name="remove" size="sm" />
        </button>
        <input
          type="range"
          min="16"
          max="30"
          step="0.5"
          value={vehicleStore.state.hvac.temperature}
          onInput={(e) => vehicleStore.setTemperature(parseFloat(e.currentTarget.value))}
          class="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-500"
        />
        <button
          class="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
          onClick={() => vehicleStore.setTemperature(vehicleStore.state.hvac.temperature + 0.5)}
        >
          <Icon name="add" size="sm" />
        </button>
      </div>

      {/* Fan Speed */}
      <div>
        <div class="flex items-center gap-2 mb-2">
          <Icon name="air" size="xs" class="text-gray-500" />
          <span class="text-sm text-gray-500">风速</span>
        </div>
        <div class="flex gap-2">
          <For each={fanSpeeds}>
            {(speed) => (
              <button
                class={cn(
                  'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200',
                  vehicleStore.state.hvac.fanSpeed === speed.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                onClick={() => vehicleStore.setFanSpeed(speed.value)}
              >
                {speed.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
