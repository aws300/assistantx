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
import { homeStore, HomeLights } from '@/stores/homeStore';

const rooms: { key: keyof HomeLights; label: string }[] = [
  { key: 'livingRoom', label: 'Living Room' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
];

interface LightItemProps {
  label: string;
  power: boolean;
  onToggle: () => void;
}

const LightItem: Component<LightItemProps> = (props) => {
  return (
    <div
      class={cn(
        'flex items-center justify-between p-3 rounded-lg transition-all duration-300 cursor-pointer',
        props.power
          ? 'bg-yellow-50 border border-yellow-200'
          : 'bg-gray-50 border border-gray-200'
      )}
      onClick={props.onToggle}
    >
      <div class="flex items-center gap-3">
        <div
          class={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300',
            props.power ? 'bg-yellow-400 shadow-lg shadow-yellow-200' : 'bg-gray-200'
          )}
        >
          <Icon
            name="lightbulb"
            size="sm"
            class={props.power ? 'text-white' : 'text-gray-500'}
            filled={props.power}
          />
        </div>
        <div>
          <div class="font-medium text-gray-800">{props.label}</div>
          <div class="text-xs text-gray-500">{props.power ? 'On' : 'Off'}</div>
        </div>
      </div>
      <div
        class={cn(
          'w-12 h-6 rounded-full transition-all duration-300 relative',
          props.power ? 'bg-yellow-400' : 'bg-gray-300'
        )}
      >
        <div
          class={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300',
            props.power ? 'left-7' : 'left-1'
          )}
        />
      </div>
    </div>
  );
};

export const HomeLightingControl: Component = () => {
  const allOn = () => rooms.every((r) => homeStore.state.lights[r.key]);
  const allOff = () => rooms.every((r) => !homeStore.state.lights[r.key]);

  return (
    <div class="liquid-glass rounded-2xl p-4">
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <Icon name="lightbulb" size="sm" class="text-yellow-600" />
          <span class="text-sm font-semibold text-gray-700">Lighting</span>
        </div>
        <div class="flex gap-2">
          <button
            class={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
              allOn()
                ? 'bg-yellow-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            onClick={() => homeStore.setAllLights(true)}
          >
            All On
          </button>
          <button
            class={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
              allOff()
                ? 'bg-gray-300 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            onClick={() => homeStore.setAllLights(false)}
          >
            All Off
          </button>
        </div>
      </div>

      {/* Room Grid */}
      <div class="space-y-3">
        <For each={rooms}>
          {(room) => (
            <LightItem
              label={room.label}
              power={homeStore.state.lights[room.key]}
              onToggle={() => homeStore.setLight(room.key, !homeStore.state.lights[room.key])}
            />
          )}
        </For>
      </div>
    </div>
  );
};
