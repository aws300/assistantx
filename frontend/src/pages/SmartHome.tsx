/**
 * SmartHome -- Smart home dashboard page (SolidJS).
 *
 * Aurora (light) background with glass-panel cards.
 * Responsive masonry grid (1/2/3 columns).
 * Registers home action handlers on mount, cleans up on unmount.
 *
 * Faithfully ported from the original React HomePage + control components.
 * All Chinese labels preserved. Icons use Material Symbols via <Icon />.
 */

import { Component, For, onMount, onCleanup, createMemo, createSignal } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { homeStore, type HomeLights, type HvacMode, type HomeFanSpeed } from '@/stores/homeStore';
import { registerHomeActions, clearActions } from '@/skills/ActionExecutor';
import { themeStore } from '@/stores/theme';
import ChatPanelBridge from '@/components/ChatPanelBridge';
import { WakeWordCard } from '@/components/WakeWordCard';
import ProfileBadge from '@/components/ProfileBadge';

// ---------------------------------------------------------------------------
// Reusable aurora glass card (matches original LiquidGlassCard)
// ---------------------------------------------------------------------------

const GlassCard: Component<{ class?: string; children?: any }> = (props) => (
  <div
    class={cn(
      'liquid-glass rounded-2xl p-5',
      'bg-white/70 backdrop-blur-md border border-white/40',
      'shadow-xl',
      props.class,
    )}
  >
    {props.children}
  </div>
);

// Card header (matches original LiquidGlassHeader)
const CardHeader: Component<{
  title: string;
  icon: string;
  iconClass?: string;
  action?: any;
}> = (props) => (
  <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-200/50">
    <div class="flex items-center gap-2">
      <Icon name={props.icon} size="sm" class={props.iconClass ?? 'text-gray-500'} />
      <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-800">{props.title}</h3>
    </div>
    {props.action}
  </div>
);

// Glass button
const GlassBtn: Component<{
  variant?: 'default' | 'primary';
  class?: string;
  icon?: string;
  onClick?: () => void;
  children?: any;
}> = (props) => (
  <button
    class={cn(
      'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer',
      'backdrop-blur-sm border',
      props.variant === 'primary'
        ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
        : 'bg-white/60 text-gray-700 border-white/60 hover:bg-white/80',
      props.class,
    )}
    onClick={props.onClick}
  >
    <span class="flex items-center gap-1 justify-center">
      {props.icon && <Icon name={props.icon} size="xs" />}
      {props.children}
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// HomeStatusCard (inline) -- weather, temps, humidity, PM2.5
// ---------------------------------------------------------------------------

const weatherIconMap: Record<string, string> = {
  '\u6674': 'wb_sunny',      // 晴
  '\u591a\u4e91': 'cloud',   // 多云
  '\u9634': 'cloud',         // 阴
  '\u5c0f\u96e8': 'rainy',   // 小雨
};
const weatherColorMap: Record<string, string> = {
  '\u6674': 'text-yellow-500',
  '\u591a\u4e91': 'text-gray-500',
  '\u9634': 'text-gray-600',
  '\u5c0f\u96e8': 'text-primary',
};

const InlineHomeStatusCard: Component = () => {
  const info = () => homeStore.state.info;

  return (
    <GlassCard>
      <CardHeader title="房屋状态" icon="home" />

      {/* Weather and Time */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <Icon
            name={weatherIconMap[info().weather] || 'wb_sunny'}
            size="lg"
            class={weatherColorMap[info().weather] || 'text-yellow-500'}
          />
          <div>
            <div class="text-lg font-bold text-gray-800">{info().weather}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold text-gray-800">
            {info().outsideTemp}&deg;
          </div>
          <div class="text-xs text-gray-500">室外温度</div>
        </div>
      </div>

      {/* Status Grid */}
      <div class="grid grid-cols-2 gap-4">
        {/* Inside temp */}
        <div class="flex items-center gap-3 p-3 rounded-lg bg-primary/5">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="thermostat" size="md" class="text-primary" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{info().insideTemp}&deg;C</div>
            <div class="text-xs text-gray-500">室内温度</div>
          </div>
        </div>

        {/* Humidity */}
        <div class="flex items-center gap-3 p-3 rounded-lg bg-cyan-50">
          <div class="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Icon name="water_drop" size="md" class="text-cyan-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{info().humidity}%</div>
            <div class="text-xs text-gray-500">湿度</div>
          </div>
        </div>

        {/* PM2.5 */}
        <div class="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-green-50">
          <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <Icon name="air" size="md" class="text-green-600" />
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">PM2.5</span>
              <span
                class={cn(
                  'text-lg font-bold',
                  info().pm25 < 35
                    ? 'text-green-600'
                    : info().pm25 < 75
                      ? 'text-yellow-600'
                      : 'text-red-600',
                )}
              >
                {info().pm25}
              </span>
            </div>
            <div class="text-xs text-gray-500">
              {info().pm25 < 35 ? '优' : info().pm25 < 75 ? '良' : '轻度污染'}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// HomeHVACControl (inline) -- power, temp slider, mode, fan speed
// ---------------------------------------------------------------------------

const modeIcons: Record<HvacMode, string> = {
  cool: 'ac_unit',
  heat: 'wb_sunny',
  auto: 'hdr_auto',
  fan: 'air',
  dry: 'water_drop',
};
const modeLabels: Record<HvacMode, string> = {
  cool: '制冷',
  heat: '制热',
  auto: '自动',
  fan: '送风',
  dry: '除湿',
};
const fanLabels: Record<HomeFanSpeed, string> = {
  low: '低',
  medium: '中',
  high: '高',
  auto: '自动',
};

const InlineHomeHVACControl: Component = () => {
  const hvac = () => homeStore.state.hvac;

  return (
    <GlassCard>
      <CardHeader
        title="空调控制"
        icon="thermostat"
        action={
          <GlassBtn
            variant={hvac().power ? 'primary' : 'default'}
            icon="power_settings_new"
            onClick={() => homeStore.setHvacPower(!hvac().power)}
          >
            {hvac().power ? 'ON' : 'OFF'}
          </GlassBtn>
        }
      />

      {/* Temperature Display */}
      <div
        class={cn(
          'flex items-center justify-center mb-6 transition-opacity',
          hvac().power ? 'opacity-100' : 'opacity-50',
        )}
      >
        <div class="text-center">
          <div class="text-5xl font-bold text-gray-800">
            {hvac().targetTemp}
            <span class="text-2xl text-gray-400">&deg;C</span>
          </div>
        </div>
      </div>

      {/* Temperature Slider + Modes */}
      <div
        class={cn(
          'transition-opacity',
          hvac().power ? 'opacity-100' : 'opacity-50 pointer-events-none',
        )}
      >
        {/* Slider */}
        <div class="mb-1">
          <div class="flex items-center justify-between text-sm text-gray-500 mb-1">
            <span>温度</span>
            <span>{hvac().targetTemp}&deg;C</span>
          </div>
          <input
            type="range"
            min={16}
            max={30}
            step={1}
            value={hvac().targetTemp}
            onInput={(e) => homeStore.setTargetTemp(Number(e.currentTarget.value))}
            class="w-full"
          />
        </div>

        {/* Mode Selection */}
        <div class="mt-4">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="air" size="xs" class="text-gray-500" />
            <span class="text-sm text-gray-500">模式</span>
          </div>
          <div class="flex gap-2">
            <For each={Object.keys(modeIcons) as HvacMode[]}>
              {(mode) => (
                <GlassBtn
                  variant={hvac().mode === mode ? 'primary' : 'default'}
                  icon={modeIcons[mode]}
                  onClick={() => homeStore.setHvacMode(mode)}
                  class="flex-1"
                >
                  {modeLabels[mode]}
                </GlassBtn>
              )}
            </For>
          </div>
        </div>

        {/* Fan Speed */}
        <div class="mt-4">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="air" size="xs" class="text-gray-500" />
            <span class="text-sm text-gray-500">风速</span>
          </div>
          <div class="flex gap-2">
            <For each={Object.keys(fanLabels) as HomeFanSpeed[]}>
              {(speed) => (
                <GlassBtn
                  variant={hvac().fanSpeed === speed ? 'primary' : 'default'}
                  onClick={() => homeStore.setFanSpeed(speed)}
                  class="flex-1"
                >
                  {fanLabels[speed]}
                </GlassBtn>
              )}
            </For>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// HomeLightingControl (inline) -- 4 rooms with toggles
// ---------------------------------------------------------------------------

const LightControl: Component<{
  label: string;
  power: boolean;
  onToggle: () => void;
}> = (props) => (
  <div
    class={cn(
      'flex items-center justify-between p-3 rounded-lg transition-all duration-300 cursor-pointer',
      props.power
        ? 'bg-yellow-50 border border-yellow-200'
        : 'bg-gray-50 border border-gray-200',
    )}
    onClick={props.onToggle}
  >
    <div class="flex items-center gap-3">
      <div
        class={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300',
          props.power ? 'bg-yellow-400 shadow-lg shadow-yellow-200' : 'bg-gray-200',
        )}
      >
        <Icon
          name="light"
          size="md"
          filled={props.power}
          class={props.power ? 'text-white' : 'text-gray-500'}
        />
      </div>
      <div>
        <div class="font-medium text-gray-800">{props.label}</div>
        <div class="text-xs text-gray-500">{props.power ? '已开启' : '已关闭'}</div>
      </div>
    </div>
    {/* Toggle switch */}
    <div
      class={cn(
        'w-12 h-6 rounded-full transition-all duration-300 relative',
        props.power ? 'bg-yellow-400' : 'bg-gray-300',
      )}
    >
      <div
        class={cn(
          'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300',
          props.power ? 'left-7' : 'left-1',
        )}
      />
    </div>
  </div>
);

const rooms: Array<{ key: keyof HomeLights; label: string }> = [
  { key: 'livingRoom', label: '客厅' },
  { key: 'bedroom', label: '卧室' },
  { key: 'kitchen', label: '厨房' },
  { key: 'bathroom', label: '卫生间' },
];

const InlineHomeLightingControl: Component = () => {
  const lights = () => homeStore.state.lights;

  const allOn = createMemo(() => rooms.every((r) => lights()[r.key]));
  const allOff = createMemo(() => rooms.every((r) => !lights()[r.key]));

  return (
    <GlassCard>
      <CardHeader
        title="灯光控制"
        icon="light"
        action={
          <div class="flex gap-2">
            <GlassBtn
              variant={allOn() ? 'primary' : 'default'}
              onClick={() => homeStore.setAllLights(true)}
            >
              全开
            </GlassBtn>
            <GlassBtn
              variant={allOff() ? 'default' : 'default'}
              onClick={() => homeStore.setAllLights(false)}
            >
              全关
            </GlassBtn>
          </div>
        }
      />

      <div class="space-y-3">
        <For each={rooms}>
          {(room) => (
            <LightControl
              label={room.label}
              power={lights()[room.key]}
              onToggle={() => homeStore.setLight(room.key, !lights()[room.key])}
            />
          )}
        </For>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// HomeCurtainControl (inline) -- slider + visual animation
// ---------------------------------------------------------------------------

const InlineHomeCurtainControl: Component = () => {
  const pos = () => homeStore.state.curtainPosition;

  const isOpen = () => pos() > 50;
  const isClosed = () => pos() < 50;

  return (
    <GlassCard>
      <CardHeader
        title="窗帘控制"
        icon="curtains"
        action={
          <div class="flex gap-2">
            <GlassBtn
              variant={isOpen() ? 'primary' : 'default'}
              onClick={() => homeStore.setCurtainPosition(100)}
            >
              全开
            </GlassBtn>
            <GlassBtn
              variant={isClosed() ? 'primary' : 'default'}
              onClick={() => homeStore.setCurtainPosition(0)}
            >
              全关
            </GlassBtn>
          </div>
        }
      />

      {/* Curtain Visual */}
      <div class="flex justify-center mb-6">
        <div class="relative w-48 h-32 border-4 border-gray-300 rounded-lg overflow-hidden bg-gradient-to-b from-blue-200 to-blue-100">
          {/* Window frame */}
          <div class="absolute inset-0 border-2 border-gray-200 rounded" />

          {/* Curtain left */}
          <div
            class="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-300 to-orange-200 transition-all duration-500 shadow-lg"
            style={{ width: `${(100 - pos()) / 2}%` }}
          >
            <div class="absolute inset-0 opacity-30">
              <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                {(i) => (
                  <div
                    class="h-full w-px bg-orange-400 absolute"
                    style={{ left: `${i * 12.5}%` }}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Curtain right */}
          <div
            class="absolute top-0 right-0 h-full bg-gradient-to-l from-orange-300 to-orange-200 transition-all duration-500 shadow-lg"
            style={{ width: `${(100 - pos()) / 2}%` }}
          >
            <div class="absolute inset-0 opacity-30">
              <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                {(i) => (
                  <div
                    class="h-full w-px bg-orange-400 absolute"
                    style={{ left: `${i * 12.5}%` }}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Sun / light indicator */}
          {pos() > 20 && (
            <div
              class="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-yellow-300 transition-opacity duration-500"
              style={{ opacity: pos() / 200 }}
            />
          )}
        </div>
      </div>

      {/* Position Display */}
      <div class="text-center mb-4">
        <span class="text-2xl font-bold text-gray-800">{pos()}%</span>
        <span class="text-sm text-gray-500 ml-2">
          {pos() === 0 ? '已关闭' : pos() === 100 ? '已全开' : '部分打开'}
        </span>
      </div>

      {/* Position Slider */}
      <div class="mb-1">
        <div class="flex items-center justify-between text-sm text-gray-500 mb-1">
          <span>开合度</span>
          <span>{pos()}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={pos()}
          onInput={(e) => homeStore.setCurtainPosition(Number(e.currentTarget.value))}
          class="w-full"
        />
      </div>

      {/* Quick Position Buttons */}
      <div class="mt-4 flex gap-2">
        <For each={[0, 25, 50, 75, 100]}>
          {(p) => (
            <GlassBtn
              variant={pos() === p ? 'primary' : 'default'}
              onClick={() => homeStore.setCurtainPosition(p)}
              class="flex-1"
            >
              {p}%
            </GlassBtn>
          )}
        </For>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// SmartHome Page
// ---------------------------------------------------------------------------

const SmartHome: Component = () => {
  const [voiceActive, setVoiceActive] = createSignal(false);
  const [autoStart, setAutoStart] = createSignal(false);

  onMount(() => {
    themeStore.setTheme('red');
    registerHomeActions();
    console.log('[SmartHome] Home action handlers registered');
  });

  onCleanup(() => {
    clearActions();
    console.log('[SmartHome] Action handlers cleared');
  });

  return (
    <div class="aurora min-h-screen w-full relative">
      {/* Profile badge - top right */}
      <ProfileBadge />

      <div class="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <header class="mb-6">
          <h1 class="text-2xl font-bold tracking-wider text-gray-800">智能家居</h1>
          <p class="text-sm text-gray-500 mt-1">Smart Home Control System</p>
        </header>

        {/* Masonry Grid - full width */}
        <div class="columns-1 md:columns-2 lg:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6">
          <div class="break-inside-avoid"><InlineHomeStatusCard /></div>
          <div class="break-inside-avoid"><InlineHomeLightingControl /></div>
          <div class="break-inside-avoid"><InlineHomeHVACControl /></div>
          <div class="break-inside-avoid"><InlineHomeCurtainControl /></div>
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
            Smart Home Control System v1.0.0 | Powered by Voice Assistant
          </p>
        </footer>
      </div>

      {/* Floating chat panel - bottom right */}
      <ChatPanelBridge
        scene="home"
        autoStart={autoStart}
        onSessionStart={() => { setVoiceActive(true); setAutoStart(false); }}
        onSessionEnd={() => setVoiceActive(false)}
      />
    </div>
  );
};

export default SmartHome;
