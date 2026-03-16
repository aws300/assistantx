/**
 * ActionExecutor -- central action dispatch for AI agent RPC calls.
 * Maps action IDs from the backend agent to frontend state mutations.
 *
 * Ported from React to plain TS (no framework dependency).
 * Uses the SolidJS vehicleStore / homeStore / chargerStore singletons directly.
 */

import { vehicleStore } from '@/stores/vehicleStore';
import { homeStore } from '@/stores/homeStore';
import { chargerStore } from '@/stores/chargerStore';
import type { FanSpeed, MassageMode, MediaSource } from '@/stores/vehicleStore';
import type { HvacMode, HomeFanSpeed, HomeLights } from '@/stores/homeStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionPayload {
  id: string;
  params: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export type ActionHandler = (params: Record<string, any>) => ActionResult | Promise<ActionResult>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const actionHandlers = new Map<string, ActionHandler>();

/** Register a single action handler. */
export function registerAction(actionId: string, handler: ActionHandler) {
  actionHandlers.set(actionId, handler);
}

/** Execute an action by ID. */
export async function executeAction(payload: ActionPayload): Promise<ActionResult> {
  const handler = actionHandlers.get(payload.id);

  if (!handler) {
    console.warn(`[ActionExecutor] No handler for action: ${payload.id}`);
    return { success: false, error: `Unknown action: ${payload.id}` };
  }

  try {
    console.log(`[ActionExecutor] Executing: ${payload.id}`, payload.params);
    const result = await handler(payload.params);
    console.log(`[ActionExecutor] Result:`, result);
    return result;
  } catch (error) {
    console.error(`[ActionExecutor] Failed:`, error);
    return { success: false, error: String(error) };
  }
}

/** Remove all registered handlers. */
export function clearActions() {
  actionHandlers.clear();
}

// ---------------------------------------------------------------------------
// Session disconnect support
// ---------------------------------------------------------------------------

let sessionDisconnectCb: (() => void) | null = null;
let sessionPrepareCb: (() => void) | null = null;

export function setSessionDisconnectCallback(
  disconnectCallback: () => void,
  prepareCallback?: () => void,
) {
  sessionDisconnectCb = disconnectCallback;
  sessionPrepareCb = prepareCallback ?? null;
}

function registerSessionDisconnect() {
  registerAction('session.disconnect', () => {
    console.log('[ActionExecutor] Session disconnect requested');

    if (sessionPrepareCb) sessionPrepareCb();

    if (sessionDisconnectCb) {
      setTimeout(() => {
        sessionDisconnectCb?.();
      }, 2500);
    }

    return { success: true, data: { message: 'Disconnecting...' } };
  });
}

// ---------------------------------------------------------------------------
// Car (vehicle) scene handlers
// ---------------------------------------------------------------------------

export function registerCarActions() {
  clearActions();
  const vs = vehicleStore;

  // -- HVAC --
  registerAction('hvac.setTemperature', (params) => {
    vs.setTemperature(Number(params.temperature));
    return { success: true, data: { temperature: params.temperature } };
  });

  registerAction('hvac.adjustTemperature', (params) => {
    const current = vs.state.hvac.temperature;
    const delta = params.direction === 'up' ? (Number(params.amount) || 2) : -(Number(params.amount) || 2);
    vs.setTemperature(current + delta);
    return { success: true, data: { temperature: vs.state.hvac.temperature } };
  });

  registerAction('hvac.getTemperature', () => {
    return {
      success: true,
      data: {
        current: vs.state.hvac.temperature,
        target: vs.state.hvac.temperature,
        outside: vs.state.info.outsideTemp,
      },
    };
  });

  registerAction('hvac.setFanSpeed', (params) => {
    vs.setFanSpeed(params.speed as FanSpeed);
    return { success: true };
  });

  registerAction('hvac.toggleAC', (params) => {
    vs.setAcOn(params.action === 'on');
    return { success: true };
  });

  // -- Windows --
  registerAction('windows.control', (params) => {
    const { window: winName, action, position } = params;
    const idx = vs.state.windows.findIndex((w) => w.name === winName);
    if (idx === -1 && (winName === 'all' || winName === '所有')) {
      const pos = action === 'open' ? 100 : action === 'close' ? 0 : Number(position) || 0;
      vs.setAllWindows(pos);
    } else if (idx >= 0) {
      const pos = action === 'open' ? 100 : action === 'close' ? 0 : Number(position) || 0;
      vs.setWindowPosition(idx, pos);
    }
    return { success: true };
  });

  // -- Seats --
  registerAction('seats.setHeating', (params) => {
    const idx = vs.state.seats.findIndex((s) => s.name === params.seat);
    if (idx >= 0) vs.setSeatHeating(idx, Number(params.level));
    return { success: true };
  });

  registerAction('seats.setCooling', (params) => {
    const idx = vs.state.seats.findIndex((s) => s.name === params.seat);
    if (idx >= 0) vs.setSeatCooling(idx, Number(params.level));
    return { success: true };
  });

  registerAction('seats.setMassage', (params) => {
    const idx = vs.state.seats.findIndex((s) => s.name === params.seat);
    if (idx >= 0) vs.setSeatMassage(idx, params.mode as MassageMode);
    return { success: true };
  });

  // -- Lighting --
  registerAction('lighting.setInterior', (params) => {
    vs.setInteriorLight(params.action === 'on');
    if (params.brightness != null) vs.setInteriorBrightness(Number(params.brightness));
    return { success: true };
  });

  registerAction('lighting.setAmbient', (params) => {
    if (params.color) vs.setAmbientColor(params.color);
    if (params.brightness != null) vs.setAmbientBrightness(Number(params.brightness));
    return { success: true };
  });

  registerAction('lighting.setReading', (params) => {
    vs.setReadingLight(params.action === 'on');
    return { success: true };
  });

  // -- Media --
  registerAction('media.setVolume', (params) => {
    if (params.level != null) {
      vs.setVolume(Number(params.level));
    } else if (params.action === 'up') {
      vs.setVolume(vs.state.media.volume + 10);
    } else if (params.action === 'down') {
      vs.setVolume(vs.state.media.volume - 10);
    } else if (params.action === 'mute') {
      vs.setVolume(0);
    }
    return { success: true };
  });

  registerAction('media.setSource', (params) => {
    vs.setMediaSource(params.source as MediaSource);
    return { success: true };
  });

  registerAction('media.playback', (params) => {
    vs.setPlaying(params.action === 'play');
    return { success: true };
  });

  // -- Info --
  registerAction('info.getVehicleStatus', () => {
    const i = vs.state.info;
    return {
      success: true,
      data: {
        speed: i.speed,
        battery: i.battery,
        range: i.range,
        odometer: i.odometer,
        charging: i.chargingStatus,
      },
    };
  });

  registerAction('info.getTirePressure', () => {
    return { success: true, data: vs.state.info.tirePressure };
  });

  registerAction('system.getState', () => {
    return { success: true, data: vs.getFullStatus() };
  });

  // -- Session --
  registerSessionDisconnect();

  console.log(`[ActionExecutor] Registered ${actionHandlers.size} car action handlers`);
}

// ---------------------------------------------------------------------------
// Home scene handlers
// ---------------------------------------------------------------------------

export function registerHomeActions() {
  clearActions();
  const hs = homeStore;

  // Room name mapping
  const roomMap: Record<string, keyof HomeLights> = {
    livingRoom: 'livingRoom',
    living_room: 'livingRoom',
    '\u5BA2\u5385': 'livingRoom',
    bedroom: 'bedroom',
    '\u5367\u5BA4': 'bedroom',
    kitchen: 'kitchen',
    '\u53A8\u623F': 'kitchen',
    bathroom: 'bathroom',
    '\u536B\u751F\u95F4': 'bathroom',
    '\u6D17\u624B\u95F4': 'bathroom',
  };

  // -- HVAC --
  registerAction('hvac.setTemperature', (params) => {
    hs.setTargetTemp(Number(params.temperature));
    return { success: true, data: { temperature: Number(params.temperature) } };
  });

  registerAction('hvac.setPower', (params) => {
    hs.setHvacPower(params.action === 'on');
    return { success: true };
  });

  registerAction('hvac.setMode', (params) => {
    hs.setHvacMode(params.mode as HvacMode);
    return { success: true };
  });

  registerAction('hvac.setFanSpeed', (params) => {
    hs.setFanSpeed(params.speed as HomeFanSpeed);
    return { success: true };
  });

  registerAction('hvac.getTemperature', () => {
    return {
      success: true,
      data: {
        inside: hs.state.info.insideTemp,
        outside: hs.state.info.outsideTemp,
        target: hs.state.hvac.targetTemp,
      },
    };
  });

  registerAction('hvac.getStatus', () => {
    const h = hs.state.hvac;
    return {
      success: true,
      data: { power: h.power, temperature: h.targetTemp, mode: h.mode, fanSpeed: h.fanSpeed },
    };
  });

  // -- Lighting --
  registerAction('lighting.control', (params) => {
    const { room, action } = params;
    const power = action === 'on';
    if (room === 'all' || room === '\u6240\u6709' || room === '\u5168\u90E8') {
      hs.setAllLights(power);
      return { success: true, data: { room: 'all', action } };
    }
    const roomKey = roomMap[room] || 'livingRoom';
    hs.setLight(roomKey, power);
    return { success: true, data: { room, action } };
  });

  registerAction('lighting.getStatus', () => {
    return { success: true, data: hs.state.lights };
  });

  // -- Curtain --
  registerAction('curtain.control', (params) => {
    const { action, position } = params;
    if (action === 'open' || action === '\u6253\u5F00' || action === '\u62C9\u5F00') {
      hs.setCurtainPosition(position != null ? Number(position) : 100);
    } else if (action === 'close' || action === '\u5173\u95ED' || action === '\u62C9\u4E0A') {
      hs.setCurtainPosition(0);
    } else if (position != null) {
      hs.setCurtainPosition(Number(position));
    }
    return { success: true, data: { action } };
  });

  registerAction('curtain.getStatus', () => {
    return { success: true, data: { position: hs.state.curtainPosition } };
  });

  // -- Info --
  registerAction('info.getTemperature', () => {
    return {
      success: true,
      data: { inside: hs.state.info.insideTemp, outside: hs.state.info.outsideTemp },
    };
  });

  registerAction('info.getWeather', () => {
    const inf = hs.state.info;
    return {
      success: true,
      data: { weather: inf.weather, outside: inf.outsideTemp, humidity: inf.humidity, pm25: inf.pm25 },
    };
  });

  registerAction('info.getHomeStatus', () => {
    return { success: true, data: hs.getFullStatus() };
  });

  // -- Session --
  registerSessionDisconnect();

  console.log(`[ActionExecutor] Registered ${actionHandlers.size} home action handlers`);
}

// ---------------------------------------------------------------------------
// Charger scene handlers
// ---------------------------------------------------------------------------

export function registerChargerActions() {
  clearActions();
  const cs = chargerStore;

  registerAction('charger.start', () => {
    cs.startCharging();
    return { success: true, data: { message: 'Charging started' } };
  });

  registerAction('charger.stop', () => {
    cs.stopCharging();
    return { success: true, data: { message: 'Charging stopped' } };
  });

  registerAction('charger.pause', () => {
    cs.pauseCharging();
    return { success: true, data: { message: 'Charging paused' } };
  });

  registerAction('charger.resume', () => {
    cs.resumeCharging();
    return { success: true, data: { message: 'Charging resumed' } };
  });

  registerAction('charger.setTargetSoc', (params) => {
    const target = Number(params.percent ?? params.targetSoc);
    cs.setTargetSoc(target);
    return {
      success: true,
      data: { targetSoc: target, estimatedTime: cs.state.battery.estimatedTime },
    };
  });

  registerAction('charger.getStatus', () => {
    const s = cs.state;
    return {
      success: true,
      data: {
        status: s.status.status,
        soc: s.status.soc,
        targetSoc: s.status.targetSoc,
        power: s.electrical.power,
        estimatedTime: s.battery.estimatedTime,
        totalEnergy: s.electrical.totalEnergy,
        currentCost: s.billing.currentCost,
      },
    };
  });

  registerAction('charger.getElectricalData', () => {
    const e = cs.state.electrical;
    return {
      success: true,
      data: { voltage: e.voltage, current: e.current, power: e.power, totalEnergy: e.totalEnergy },
    };
  });

  registerAction('charger.getTemperature', () => {
    const t = cs.state.temperature;
    return {
      success: true,
      data: { connector: t.connector, module: t.module, ambient: t.ambient },
    };
  });

  registerAction('charger.getBilling', () => {
    const b = cs.state.billing;
    return {
      success: true,
      data: { rate: b.rate, currentCost: b.currentCost, totalEnergy: cs.state.electrical.totalEnergy },
    };
  });

  // -- Session --
  registerSessionDisconnect();

  console.log(`[ActionExecutor] Registered ${actionHandlers.size} charger action handlers`);
}
