/**
 * Charger -- EV charger dashboard page (SolidJS).
 *
 * Aurora (light) background with glass-panel cards.
 * Responsive masonry grid (1/2/3 columns).
 * Registers charger action handlers on mount, cleans up on unmount.
 *
 * Faithfully ported from the original React ChargerPage + control components.
 * All Chinese labels preserved. Icons use Material Symbols via <Icon />.
 */

import { Component, For, Show, onMount, onCleanup, createMemo, createSignal } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { chargerStore, type ChargingStatus } from '@/stores/chargerStore';
import { registerChargerActions, clearActions } from '@/skills/ActionExecutor';
import { themeStore } from '@/stores/theme';
import ChatPanelBridge from '@/components/ChatPanelBridge';
import { WakeWordCard } from '@/components/WakeWordCard';
import ProfileBadge from '@/components/ProfileBadge';

// ---------------------------------------------------------------------------
// Reusable aurora glass card
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

const CardHeader: Component<{
  title: string;
  icon: string;
  iconClass?: string;
}> = (props) => (
  <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-200/50">
    <div class="flex items-center gap-2">
      <Icon name={props.icon} size="sm" class={props.iconClass ?? 'text-gray-500'} />
      <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-800">{props.title}</h3>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

const statusDisplayNames: Record<ChargingStatus, string> = {
  charging: '充电中',
  idle: '空闲',
  paused: '已暂停',
  completed: '已完成',
};

const statusColors: Record<ChargingStatus, string> = {
  charging: 'bg-green-100 text-green-700',
  idle: 'bg-gray-100 text-gray-600',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-primary/10 text-primary',
};

// ---------------------------------------------------------------------------
// ChargerStatusCard (inline)
// ---------------------------------------------------------------------------

const InlineChargerStatusCard: Component = () => {
  const st = () => chargerStore.state.status;
  const elec = () => chargerStore.state.electrical;
  const bat = () => chargerStore.state.battery;
  const bill = () => chargerStore.state.billing;

  const isCharging = () => st().status === 'charging';
  const isPaused = () => st().status === 'paused';
  const canStart = () => st().status === 'idle' || st().status === 'completed';
  const canStop = () => isCharging() || isPaused();

  return (
    <GlassCard>
      <CardHeader title="充电状态" icon="bolt" />

      {/* Status Badge and Power */}
      <div class="flex items-center justify-between mb-4">
        <div>
          <span
            class={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
              statusColors[st().status],
            )}
          >
            <Show when={isCharging()}>
              <span class="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
            </Show>
            {statusDisplayNames[st().status]}
          </span>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold text-primary">
            {elec().power}<span class="text-lg ml-1">kW</span>
          </div>
          <div class="text-xs text-gray-500">实时功率</div>
        </div>
      </div>

      {/* Battery SoC Progress */}
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <Icon name="battery_charging_full" size="sm" class="text-green-600" />
            <span class="text-sm font-medium text-gray-700">电池电量</span>
          </div>
          <div class="text-sm">
            <span class="font-bold text-gray-800">{st().soc}%</span>
            <span class="text-gray-500"> / {st().targetSoc}%</span>
          </div>
        </div>
        <div class="relative h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="absolute left-0 top-0 h-full bg-primary transition-all duration-500"
            style={{ width: `${st().soc}%` }}
          />
          {/* Target marker */}
          <div
            class="absolute top-0 w-0.5 h-full bg-primary"
            style={{ left: `${st().targetSoc}%` }}
          />
        </div>
        <div class="flex justify-between mt-1 text-xs text-gray-500">
          <span>0%</span>
          <span>目标: {st().targetSoc}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-primary/5">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="schedule" size="md" class="text-primary" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">
              {bat().estimatedTime > 0 ? `${bat().estimatedTime}分钟` : '--'}
            </div>
            <div class="text-xs text-gray-500">预计剩余</div>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-amber-50">
          <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Icon name="payments" size="md" class="text-amber-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">&yen;{bill().currentCost.toFixed(1)}</div>
            <div class="text-xs text-gray-500">当前费用</div>
          </div>
        </div>
      </div>

      {/* Charging Info */}
      <div class="flex items-center justify-between text-sm text-gray-600 mb-4 px-1">
        <span>已充 {elec().totalEnergy.toFixed(1)} kWh</span>
        <span>电价 &yen;{bill().rate}/kWh</span>
      </div>

      {/* Control Buttons */}
      <div class="flex gap-2">
        <Show when={canStart()}>
          <button
            onClick={() => chargerStore.startCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors cursor-pointer"
          >
            <Icon name="play_arrow" size="sm" />
            开始充电
          </button>
        </Show>

        <Show when={isCharging()}>
          <button
            onClick={() => chargerStore.pauseCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors cursor-pointer"
          >
            <Icon name="pause" size="sm" />
            暂停
          </button>
          <button
            onClick={() => chargerStore.stopCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors cursor-pointer"
          >
            <Icon name="stop" size="sm" />
            停止
          </button>
        </Show>

        <Show when={isPaused()}>
          <button
            onClick={() => chargerStore.resumeCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors cursor-pointer"
          >
            <Icon name="play_arrow" size="sm" />
            继续
          </button>
          <button
            onClick={() => chargerStore.stopCharging()}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors cursor-pointer"
          >
            <Icon name="stop" size="sm" />
            停止
          </button>
        </Show>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// ChargingDataCard (inline) -- voltage, current, power, energy
// ---------------------------------------------------------------------------

const InlineChargingDataCard: Component = () => {
  const elec = () => chargerStore.state.electrical;

  const maxPower = 60; // kW max
  const powerPercent = createMemo(() => Math.min(100, (elec().power / maxPower) * 100));

  return (
    <GlassCard>
      <CardHeader title="电气运行数据" icon="monitoring" />

      {/* Power Gauge */}
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-gray-700">实时功率</span>
          <span class="text-sm text-gray-500">最大 {maxPower} kW</span>
        </div>
        <div class="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-primary transition-all duration-300"
            style={{ width: `${powerPercent()}%` }}
          />
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-2xl font-bold text-primary">{elec().power} kW</span>
          <span class="text-sm text-gray-500">{powerPercent().toFixed(0)}%</span>
        </div>
      </div>

      {/* Voltage & Current Grid */}
      <div class="grid grid-cols-2 gap-4 mb-4">
        {/* Voltage */}
        <div class="space-y-3">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">电压</div>
          <div class="p-3 rounded-lg bg-purple-50">
            <div class="flex items-center gap-2 mb-1">
              <Icon name="speed" size="xs" class="text-purple-600" />
              <span class="text-xs text-gray-600">电压</span>
            </div>
            <div class="text-xl font-bold text-gray-800">{elec().voltage} V</div>
          </div>
        </div>

        {/* Current */}
        <div class="space-y-3">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">电流</div>
          <div class="p-3 rounded-lg bg-green-50">
            <div class="flex items-center gap-2 mb-1">
              <Icon name="bolt" size="xs" class="text-green-600" />
              <span class="text-xs text-gray-600">电流</span>
            </div>
            <div class="text-xl font-bold text-gray-800">{elec().current} A</div>
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div class="grid grid-cols-2 gap-3">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-primary/5">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="bar_chart" size="md" class="text-primary" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{elec().totalEnergy.toFixed(1)}</div>
            <div class="text-xs text-gray-500">累计电量 kWh</div>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-cyan-50">
          <div class="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Icon name="bolt" size="md" class="text-cyan-600" />
          </div>
          <div>
            <div class="text-lg font-bold text-gray-800">{elec().power.toFixed(1)}</div>
            <div class="text-xs text-gray-500">功率 kW</div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// EnvironmentCard (inline) -- 3 temperature bars with thresholds
// ---------------------------------------------------------------------------

function getTempColor(temp: number, maxSafe: number): string {
  const ratio = temp / maxSafe;
  if (ratio < 0.6) return 'text-green-600 bg-green-100';
  if (ratio < 0.8) return 'text-yellow-600 bg-yellow-100';
  return 'text-red-600 bg-red-100';
}

function getTempBarColor(temp: number, maxSafe: number): string {
  const ratio = temp / maxSafe;
  if (ratio < 0.6) return 'from-green-400 to-green-600';
  if (ratio < 0.8) return 'from-yellow-400 to-yellow-600';
  return 'from-red-400 to-red-600';
}

const TempItem: Component<{
  icon: string;
  label: string;
  value: number;
  maxSafe: number;
}> = (props) => {
  const percent = () => Math.min(100, (props.value / props.maxSafe) * 100);

  return (
    <div class="p-3 rounded-lg bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <div class={cn('w-8 h-8 rounded-lg flex items-center justify-center', getTempColor(props.value, props.maxSafe))}>
            <Icon name={props.icon} size="sm" />
          </div>
          <span class="text-sm font-medium text-gray-700">{props.label}</span>
        </div>
        <span class="text-lg font-bold text-gray-800">{props.value}&deg;C</span>
      </div>
      <div class="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          class={cn(
            'absolute left-0 top-0 h-full bg-gradient-to-r transition-all duration-300',
            getTempBarColor(props.value, props.maxSafe),
          )}
          style={{ width: `${percent()}%` }}
        />
      </div>
      <div class="flex justify-between mt-1 text-xs text-gray-400">
        <span>0&deg;C</span>
        <span>安全阈值 {props.maxSafe}&deg;C</span>
      </div>
    </div>
  );
};

const InlineEnvironmentCard: Component = () => {
  const temp = () => chargerStore.state.temperature;

  return (
    <GlassCard>
      <CardHeader title="温度监测" icon="thermostat" />

      <div class="space-y-4">
        <TempItem icon="thermostat" label="枪头温度" value={temp().connector} maxSafe={85} />
        <TempItem icon="memory" label="模块温度" value={temp().module} maxSafe={70} />
        <TempItem icon="wb_sunny" label="环境温度" value={temp().ambient} maxSafe={45} />
      </div>

      {/* Temperature Summary */}
      <div class="mt-4 p-3 rounded-lg bg-primary/5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">系统散热状态</span>
          <span class="font-medium text-green-600">正常</span>
        </div>
      </div>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// Charger Page
// ---------------------------------------------------------------------------

const Charger: Component = () => {
  const [voiceActive, setVoiceActive] = createSignal(false);
  const [autoStart, setAutoStart] = createSignal(false);

  onMount(() => {
    themeStore.setTheme('green');
    registerChargerActions();
    console.log('[Charger] Charger action handlers registered');
  });

  onCleanup(() => {
    clearActions();
    console.log('[Charger] Action handlers cleared');
  });

  return (
    <div class="aurora min-h-screen w-full relative">
      {/* Profile badge - top right */}
      <ProfileBadge />

      <div class="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <header class="mb-6">
          <h1 class="text-2xl font-bold tracking-wider text-gray-800">智能充电桩</h1>
          <p class="text-sm text-gray-500 mt-1">Smart EV Charger System</p>
        </header>

        {/* Masonry Grid - full width */}
        <div class="columns-1 md:columns-2 lg:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6">
          <div class="break-inside-avoid"><InlineChargerStatusCard /></div>
          <div class="break-inside-avoid"><InlineChargingDataCard /></div>
          <div class="break-inside-avoid"><InlineEnvironmentCard /></div>
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
            EV Charging Station Control System v1.0.0 | Powered by Voice Assistant
          </p>
        </footer>
      </div>

      {/* Floating chat panel - bottom right */}
      <ChatPanelBridge
        scene="charger"
        autoStart={autoStart}
        onSessionStart={() => { setVoiceActive(true); setAutoStart(false); }}
        onSessionEnd={() => setVoiceActive(false)}
      />
    </div>
  );
};

export default Charger;
