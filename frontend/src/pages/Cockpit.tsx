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
/**
 * Cockpit Page - Main dashboard for vehicle control
 * Light aurora theme with frosted glass cards.
 * Responsive masonry grid: 1 col (mobile) -> 2 cols (tablet) -> 3 cols (desktop)
 *
 * Faithfully ported from the original React CockpitPage.
 * All control components are inline (same file).
 * Uses Material Symbols via <Icon />.
 */

import { Component, onMount, onCleanup, For, Show, createSignal } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { vehicleStore } from '@/stores/vehicleStore';
import { registerCarActions, clearActions } from '@/skills/ActionExecutor';
import { themeStore } from '@/stores/theme';
import ChatPanelBridge from '@/components/ChatPanelBridge';
import { WakeWordCard } from '@/components/WakeWordCard';
import ProfileBadge from '@/components/ProfileBadge';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AMBIENT_COLORS = [
  { color: '#3B82F6', name: '蓝' },
  { color: '#EF4444', name: '红' },
  { color: '#22C55E', name: '绿' },
  { color: '#F97316', name: '橙' },
  { color: '#A855F7', name: '紫' },
  { color: '#EC4899', name: '粉' },
  { color: '#06B6D4', name: '青' },
  { color: '#6B7280', name: '白' },
];

// ---------------------------------------------------------------------------
// Reusable light glass card (matches LiquidGlassCard from original)
// ---------------------------------------------------------------------------

const LiquidGlassCard: Component<{ class?: string; children?: any }> = (props) => (
  <div
    class={cn(
      'relative overflow-hidden rounded-2xl',
      'bg-white/70 backdrop-blur-xl',
      'border border-white/50',
      'shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)]',
      'transition-all duration-300',
      props.class,
    )}
  >
    {/* Subtle gradient overlay */}
    <div class="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-slate-100/30 pointer-events-none" />
    <div class="relative px-6 py-5">
      {props.children}
    </div>
  </div>
);

const LiquidGlassHeader: Component<{
  title: string;
  icon: string;
  iconClass?: string;
  action?: any;
}> = (props) => (
  <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-200/50">
    <div class="flex items-center gap-2">
      <Icon name={props.icon} size="sm" class={props.iconClass || 'text-gray-500'} />
      <h3 class="text-sm font-semibold text-gray-800 uppercase tracking-wide">
        {props.title}
      </h3>
    </div>
    <Show when={props.action}>{props.action}</Show>
  </div>
);

// ---------------------------------------------------------------------------
// GlassButton
// ---------------------------------------------------------------------------

const GlassButton: Component<{
  variant?: 'default' | 'primary';
  size?: 'sm' | 'md';
  class?: string;
  onClick?: () => void;
  children?: any;
}> = (props) => (
  <button
    class={cn(
      'rounded-lg font-medium transition-all duration-200 cursor-pointer',
      props.size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
      props.variant === 'primary'
        ? 'bg-primary text-white shadow-sm shadow-primary/20'
        : 'bg-white/80 text-gray-600 border border-gray-200/60 hover:bg-white',
      props.class,
    )}
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

// ---------------------------------------------------------------------------
// GlassSlider
// ---------------------------------------------------------------------------

const GlassSlider: Component<{
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  unit?: string;
  showValue?: boolean;
}> = (props) => (
  <div>
    <Show when={props.label || props.showValue}>
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>{props.label ?? ''}</span>
        <span>{props.value}{props.unit ?? ''}</span>
      </div>
    </Show>
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      value={props.value}
      onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      class="w-full"
    />
  </div>
);

// ---------------------------------------------------------------------------
// Vehicle Status Card
// ---------------------------------------------------------------------------

const VehicleStatusCard: Component = () => {
  const info = () => vehicleStore.state.info;

  return (
    <LiquidGlassCard>
      <LiquidGlassHeader title="车辆状态" icon="directions_car" />

      <div class="grid grid-cols-2 gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="speed" size="md" class="text-primary" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{info().speed}</div>
            <div class="text-xs text-gray-500">km/h</div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <Icon name="battery_full" size="md" class="text-green-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{info().battery}%</div>
            <div class="text-xs text-gray-500">电量</div>
          </div>
        </div>

        <div class="col-span-2 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">续航里程</span>
            <span class="text-gray-800 font-medium">{info().range} km</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">车外温度</span>
            <span class="text-gray-800 font-medium">{info().outsideTemp}&deg;C</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">总里程</span>
            <span class="text-gray-800 font-medium">{info().odometer.toLocaleString()} km</span>
          </div>
        </div>
      </div>
    </LiquidGlassCard>
  );
};

// ---------------------------------------------------------------------------
// Window Control
// ---------------------------------------------------------------------------

const WindowButton: Component<{
  label: string;
  position: number;
  onOpen: () => void;
  onClose: () => void;
}> = (props) => {
  const isOpen = () => props.position > 0;

  return (
    <div class="flex flex-col items-center gap-2">
      <div
        class={cn(
          'w-12 h-16 rounded-lg border-2 transition-all duration-300 relative overflow-hidden',
          isOpen() ? 'border-primary' : 'border-gray-300',
        )}
      >
        {/* Window glass */}
        <div
          class="absolute bottom-0 left-0 right-0 bg-primary/20 transition-all duration-300"
          style={{ height: `${100 - props.position}%` }}
        />
        {/* Open indicator */}
        <Show when={isOpen()}>
          <div class="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-primary rounded-full" />
        </Show>
      </div>
      <span class="text-xs text-gray-500">{props.label}</span>
      <div class="flex gap-1">
        <button
          onClick={props.onOpen}
          class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors cursor-pointer"
        >
          ↑
        </button>
        <button
          onClick={props.onClose}
          class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors cursor-pointer"
        >
          ↓
        </button>
      </div>
    </div>
  );
};

const WindowControlCard: Component = () => {
  const windows = () => vehicleStore.state.windows;

  // Helper to find a window by name
  const win = (name: string) => {
    const w = windows().find((w) => w.name === name);
    return w ? w.position : 0;
  };

  const control = (name: string, action: 'open' | 'close') => {
    const idx = windows().findIndex((w) => w.name === name);
    if (idx < 0) return;
    vehicleStore.setWindowPosition(idx, action === 'open' ? 100 : 0);
  };

  const closeAll = () => vehicleStore.setAllWindows(0);

  return (
    <LiquidGlassCard>
      <LiquidGlassHeader
        title="车窗控制"
        icon="sensor_window"
        action={
          <GlassButton size="sm" onClick={closeAll}>
            全关
          </GlassButton>
        }
      />

      {/* Car top view with windows */}
      <div class="flex justify-center gap-8 py-4">
        {/* Left side */}
        <div class="flex flex-col gap-4">
          <WindowButton
            label="左前"
            position={win('frontLeft')}
            onOpen={() => control('frontLeft', 'open')}
            onClose={() => control('frontLeft', 'close')}
          />
          <WindowButton
            label="左后"
            position={win('rearLeft')}
            onOpen={() => control('rearLeft', 'open')}
            onClose={() => control('rearLeft', 'close')}
          />
        </div>

        {/* Center - Sunroof */}
        <div class="flex flex-col items-center justify-center">
          <div
            class={cn(
              'w-16 h-24 rounded-xl border-2 transition-all duration-300 relative overflow-hidden',
              win('sunroof') > 0 ? 'border-primary' : 'border-gray-300',
            )}
          >
            <div
              class="absolute bottom-0 left-0 right-0 bg-primary/20 transition-all duration-300"
              style={{ height: `${100 - win('sunroof')}%` }}
            />
          </div>
          <span class="text-xs text-gray-500 mt-2">天窗</span>
          <div class="flex gap-1 mt-2">
            <button
              onClick={() => control('sunroof', 'open')}
              class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors cursor-pointer"
            >
              ↑
            </button>
            <button
              onClick={() => control('sunroof', 'close')}
              class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition-colors cursor-pointer"
            >
              ↓
            </button>
          </div>
        </div>

        {/* Right side */}
        <div class="flex flex-col gap-4">
          <WindowButton
            label="右前"
            position={win('frontRight')}
            onOpen={() => control('frontRight', 'open')}
            onClose={() => control('frontRight', 'close')}
          />
          <WindowButton
            label="右后"
            position={win('rearRight')}
            onOpen={() => control('rearRight', 'open')}
            onClose={() => control('rearRight', 'close')}
          />
        </div>
      </div>
    </LiquidGlassCard>
  );
};

// ---------------------------------------------------------------------------
// Lighting Control
// ---------------------------------------------------------------------------

const LightingControlCard: Component = () => {
  const lighting = () => vehicleStore.state.lighting;

  return (
    <LiquidGlassCard>
      <LiquidGlassHeader title="灯光控制" icon="light" />

      {/* Interior Light */}
      <div class="mb-6">
        <div class="flex items-center gap-2 mb-3">
          <Icon name="wb_sunny" size="xs" class="text-gray-500" />
          <span class="text-sm text-gray-600">车内灯</span>
        </div>
        <GlassSlider
          value={lighting().interior.brightness}
          onChange={(v) => {
            vehicleStore.setInteriorBrightness(v);
            vehicleStore.setInteriorLight(v > 0);
          }}
          min={0}
          max={100}
          unit="%"
          showValue
        />
      </div>

      {/* Ambient Light */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div
              class="w-4 h-4 rounded-full border border-gray-200"
              style={{
                'background-color': lighting().ambient.color,
                'box-shadow': `0 0 10px ${lighting().ambient.color}`,
              }}
            />
            <span class="text-sm text-gray-600">氛围灯</span>
          </div>
          <span class="text-xs text-gray-500">{lighting().ambient.brightness}%</span>
        </div>

        {/* Color Picker */}
        <div class="flex gap-2 mb-4">
          <For each={AMBIENT_COLORS}>
            {({ color, name }) => (
              <button
                onClick={() => vehicleStore.setAmbientColor(color)}
                class={cn(
                  'w-8 h-8 rounded-full transition-all duration-200 border-2 cursor-pointer',
                  lighting().ambient.color === color
                    ? 'border-gray-800 scale-110'
                    : 'border-transparent hover:scale-105',
                )}
                style={{
                  'background-color': color,
                  'box-shadow':
                    lighting().ambient.color === color ? `0 0 15px ${color}` : 'none',
                }}
                title={name}
              />
            )}
          </For>
        </div>

        {/* Brightness Slider */}
        <GlassSlider
          value={lighting().ambient.brightness}
          onChange={(v) => vehicleStore.setAmbientBrightness(v)}
          min={0}
          max={100}
          label="亮度"
          unit="%"
        />
      </div>
    </LiquidGlassCard>
  );
};

// ---------------------------------------------------------------------------
// HVAC Control
// ---------------------------------------------------------------------------

const HVACControlCard: Component = () => {
  const hvac = () => vehicleStore.state.hvac;

  // Map store fanSpeed to a numeric level for button highlighting
  const fanLevel = (): number | 'auto' => {
    const fs = hvac().fanSpeed;
    if (fs === 'auto') return 'auto';
    if (fs === 'off') return 0;
    if (fs === 'low') return 1;
    if (fs === 'medium') return 3;
    if (fs === 'high') return 5;
    return 0;
  };

  const setFanLevel = (level: number | 'auto') => {
    if (level === 'auto') {
      vehicleStore.setFanSpeed('auto');
    } else if (level <= 1) {
      vehicleStore.setFanSpeed('low');
    } else if (level <= 3) {
      vehicleStore.setFanSpeed('medium');
    } else {
      vehicleStore.setFanSpeed('high');
    }
  };

  return (
    <LiquidGlassCard>
      <LiquidGlassHeader
        title="空调控制"
        icon="thermostat"
        action={
          <GlassButton
            size="sm"
            variant={hvac().acOn ? 'primary' : 'default'}
            onClick={() => vehicleStore.setAcOn(!hvac().acOn)}
          >
            <div class="flex items-center gap-1">
              <Icon name="power_settings_new" size="xs" />
              {hvac().acOn ? 'ON' : 'OFF'}
            </div>
          </GlassButton>
        }
      />

      {/* Temperature Display */}
      <div class="flex items-center justify-center mb-6">
        <div class="text-center">
          <div class="text-5xl font-bold text-gray-800">
            {hvac().temperature}
            <span class="text-2xl text-gray-400">&deg;C</span>
          </div>
        </div>
      </div>

      {/* Temperature Slider */}
      <GlassSlider
        value={hvac().temperature}
        onChange={(v) => vehicleStore.setTemperature(v)}
        min={16}
        max={30}
        step={0.5}
        label="温度"
        unit="°C"
      />

      {/* Fan Speed */}
      <div class="mt-4">
        <div class="flex items-center gap-2 mb-2">
          <Icon name="air" size="xs" class="text-gray-500" />
          <span class="text-sm text-gray-500">风速</span>
        </div>
        <div class="flex gap-2">
          <GlassButton
            size="sm"
            variant={fanLevel() === 'auto' ? 'primary' : 'default'}
            onClick={() => setFanLevel('auto')}
            class="flex-1"
          >
            自动
          </GlassButton>
          <For each={[1, 2, 3, 4, 5]}>
            {(level) => (
              <GlassButton
                size="sm"
                variant={fanLevel() !== 'auto' && fanLevel() === level ? 'primary' : 'default'}
                onClick={() => setFanLevel(level)}
                class="w-10"
              >
                {level}
              </GlassButton>
            )}
          </For>
        </div>
      </div>
    </LiquidGlassCard>
  );
};

// ---------------------------------------------------------------------------
// Seat Control
// ---------------------------------------------------------------------------

const SeatControlPanel: Component<{
  label: string;
  heating: number;
  cooling: number;
  onHeatingChange: (level: number) => void;
  onCoolingChange: (level: number) => void;
}> = (props) => (
  <div class="flex-1">
    <div class="text-sm text-gray-600 mb-3 text-center font-medium">{props.label}</div>

    {/* Heating */}
    <div class="mb-3">
      <div class="flex items-center gap-1 mb-2">
        <Icon name="local_fire_department" size="xs" class="text-primary" />
        <span class="text-xs text-gray-500">加热</span>
      </div>
      <div class="flex gap-1">
        <For each={[0, 1, 2, 3]}>
          {(level) => (
            <button
              onClick={() => props.onHeatingChange(level)}
              class={cn(
                'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer',
                props.heating === level
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {level === 0 ? 'OFF' : level}
            </button>
          )}
        </For>
      </div>
    </div>

    {/* Cooling */}
    <div>
      <div class="flex items-center gap-1 mb-2">
        <Icon name="air" size="xs" class="text-primary" />
        <span class="text-xs text-gray-500">通风</span>
      </div>
      <div class="flex gap-1">
        <For each={[0, 1, 2, 3]}>
          {(level) => (
            <button
              onClick={() => props.onCoolingChange(level)}
              class={cn(
                'flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer',
                props.cooling === level
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {level === 0 ? 'OFF' : level}
            </button>
          )}
        </For>
      </div>
    </div>
  </div>
);

const SeatControlCard: Component = () => {
  const seats = () => vehicleStore.state.seats;

  // Index helpers
  const driverIdx = () => seats().findIndex((s) => s.name === 'driver');
  const passengerIdx = () => seats().findIndex((s) => s.name === 'passenger');

  return (
    <LiquidGlassCard>
      <LiquidGlassHeader title="座椅控制" icon="event_seat" />

      <div class="flex gap-6">
        <SeatControlPanel
          label="驾驶座"
          heating={seats()[driverIdx()]?.heating ?? 0}
          cooling={seats()[driverIdx()]?.cooling ?? 0}
          onHeatingChange={(level) => vehicleStore.setSeatHeating(driverIdx(), level)}
          onCoolingChange={(level) => vehicleStore.setSeatCooling(driverIdx(), level)}
        />

        <div class="w-px bg-gray-200" />

        <SeatControlPanel
          label="副驾驶"
          heating={seats()[passengerIdx()]?.heating ?? 0}
          cooling={seats()[passengerIdx()]?.cooling ?? 0}
          onHeatingChange={(level) => vehicleStore.setSeatHeating(passengerIdx(), level)}
          onCoolingChange={(level) => vehicleStore.setSeatCooling(passengerIdx(), level)}
        />
      </div>
    </LiquidGlassCard>
  );
};

// ---------------------------------------------------------------------------
// Cockpit Page
// ---------------------------------------------------------------------------

const Cockpit: Component = () => {
  // Wake word ↔ voice session coordination
  const [voiceActive, setVoiceActive] = createSignal(false);
  const [autoStart, setAutoStart] = createSignal(false);

  onMount(() => {
    themeStore.setTheme('blue');
    registerCarActions();
    console.log('[Cockpit] Car action handlers registered');
  });

  onCleanup(() => {
    clearActions();
    console.log('[Cockpit] Action handlers cleared');
  });

  return (
    <div class="aurora min-h-screen w-full relative">
      {/* Profile badge - top right */}
      <ProfileBadge />

      <div class="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <header class="mb-6">
          <h1 class="text-2xl font-bold tracking-wider text-gray-800">智能座舱</h1>
          <p class="text-sm text-gray-500 mt-1">Vehicle Voice Control System</p>
        </header>

        {/* Masonry Grid - full width */}
        <div class="columns-1 md:columns-2 lg:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6">
          <div class="break-inside-avoid"><VehicleStatusCard /></div>
          <div class="break-inside-avoid"><WindowControlCard /></div>
          <div class="break-inside-avoid"><LightingControlCard /></div>
          <div class="break-inside-avoid"><HVACControlCard /></div>
          <div class="break-inside-avoid"><SeatControlCard /></div>
          <div class="break-inside-avoid">
            <WakeWordCard
              isSessionActive={voiceActive()}
              onDetected={() => setAutoStart(true)}
            />
          </div>
        </div>

        {/* Footer */}
        <footer class="mt-8 text-center">
          <p class="text-xs text-gray-400">
            Vehicle Voice Control System v1.0.0 | Powered by Nova Sonic 2
          </p>
        </footer>
      </div>

      {/* Floating chat panel - bottom right */}
      <ChatPanelBridge
        scene="car"
        autoStart={autoStart}
        onSessionStart={() => { setVoiceActive(true); setAutoStart(false); }}
        onSessionEnd={() => setVoiceActive(false)}
      />
    </div>
  );
};

export default Cockpit;
