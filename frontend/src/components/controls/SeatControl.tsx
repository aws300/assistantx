import { Component, For } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { vehicleStore, MassageMode } from '@/stores/vehicleStore';

const heatingLevels = [0, 1, 2, 3];
const coolingLevels = [0, 1, 2, 3];
const massageModes: { value: MassageMode; label: string }[] = [
  { value: 'off', label: 'OFF' },
  { value: 'wave', label: '波浪' },
  { value: 'pulse', label: '脉冲' },
  { value: 'stretch', label: '拉伸' },
];

interface SeatPanelProps {
  label: string;
  index: number;
}

const SeatPanel: Component<SeatPanelProps> = (props) => {
  const seat = () => vehicleStore.state.seats[props.index];

  return (
    <div class="flex-1">
      <div class="text-sm text-gray-600 mb-3 text-center font-medium">{props.label}</div>

      {/* Heating */}
      <div class="mb-3">
        <div class="flex items-center gap-1 mb-2">
          <Icon name="local_fire_department" size="xs" class="text-orange-500" />
          <span class="text-xs text-gray-500">加热</span>
        </div>
        <div class="flex gap-1">
          <For each={heatingLevels}>
            {(level) => (
              <button
                class={cn(
                  'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200',
                  seat().heating === level
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                onClick={() => vehicleStore.setSeatHeating(props.index, level)}
              >
                {level === 0 ? 'OFF' : level}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Cooling */}
      <div class="mb-3">
        <div class="flex items-center gap-1 mb-2">
          <Icon name="air" size="xs" class="text-cyan-500" />
          <span class="text-xs text-gray-500">通风</span>
        </div>
        <div class="flex gap-1">
          <For each={coolingLevels}>
            {(level) => (
              <button
                class={cn(
                  'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200',
                  seat().cooling === level
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                onClick={() => vehicleStore.setSeatCooling(props.index, level)}
              >
                {level === 0 ? 'OFF' : level}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Massage */}
      <div>
        <div class="flex items-center gap-1 mb-2">
          <Icon name="self_improvement" size="xs" class="text-purple-500" />
          <span class="text-xs text-gray-500">按摩</span>
        </div>
        <div class="flex gap-1">
          <For each={massageModes}>
            {(mode) => (
              <button
                class={cn(
                  'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200',
                  seat().massage === mode.value
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                onClick={() => vehicleStore.setSeatMassage(props.index, mode.value)}
              >
                {mode.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export const SeatControl: Component = () => {
  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center gap-2 mb-4">
        <Icon name="event_seat" size="sm" class="text-blue-600" />
        <span class="text-sm font-semibold text-gray-700">座椅控制</span>
      </div>

      {/* Seat panels */}
      <div class="flex gap-6">
        <SeatPanel label="驾驶座" index={0} />
        <div class="w-px bg-gray-200" />
        <SeatPanel label="副驾驶" index={1} />
      </div>
    </div>
  );
};
