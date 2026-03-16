import { createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';

// --- Types ---

export type FanSpeed = 'off' | 'low' | 'medium' | 'high' | 'auto';
export type MassageMode = 'off' | 'wave' | 'pulse' | 'stretch';
export type MediaSource = 'bluetooth' | 'usb' | 'radio' | 'streaming';

export interface HvacZone {
  name: string;
  temperature: number;
  enabled: boolean;
}

export interface HvacState {
  temperature: number;
  fanSpeed: FanSpeed;
  acOn: boolean;
  zones: HvacZone[];
}

export interface WindowState {
  name: string;
  position: number; // 0 = fully closed, 100 = fully open
}

export interface SeatState {
  name: string;
  heating: number;   // 0-3
  cooling: number;   // 0-3
  massage: MassageMode;
}

export interface LightingState {
  interior: { on: boolean; brightness: number };
  ambient: { color: string; brightness: number };
  reading: { on: boolean };
}

export interface MediaState {
  volume: number;
  source: MediaSource;
  playing: boolean;
}

export interface VehicleInfo {
  speed: number;
  battery: number;
  range: number;
  odometer: number;
  tirePressure: { fl: number; fr: number; rl: number; rr: number };
  outsideTemp: number;
  chargingStatus: boolean;
}

export interface VehicleState {
  hvac: HvacState;
  windows: WindowState[];
  seats: SeatState[];
  lighting: LightingState;
  media: MediaState;
  info: VehicleInfo;
}

// --- Store ---

function createVehicleStore() {
  const [state, setState] = createStore<VehicleState>({
    hvac: {
      temperature: 24,
      fanSpeed: 'auto',
      acOn: true,
      zones: [
        { name: 'driver', temperature: 24, enabled: true },
        { name: 'passenger', temperature: 24, enabled: true },
        { name: 'rearLeft', temperature: 23, enabled: true },
        { name: 'rearRight', temperature: 23, enabled: true },
      ],
    },
    windows: [
      { name: 'frontLeft', position: 0 },
      { name: 'frontRight', position: 0 },
      { name: 'rearLeft', position: 0 },
      { name: 'rearRight', position: 0 },
      { name: 'sunroof', position: 0 },
    ],
    seats: [
      { name: 'driver', heating: 0, cooling: 0, massage: 'off' },
      { name: 'passenger', heating: 0, cooling: 0, massage: 'off' },
    ],
    lighting: {
      interior: { on: false, brightness: 50 },
      ambient: { color: '#4a90d9', brightness: 50 },
      reading: { on: false },
    },
    media: {
      volume: 50,
      source: 'bluetooth',
      playing: false,
    },
    info: {
      speed: 0,
      battery: 85,
      range: 350,
      odometer: 12580,
      tirePressure: { fl: 2.4, fr: 2.4, rl: 2.3, rr: 2.3 },
      outsideTemp: 22,
      chargingStatus: false,
    },
  });

  // --- HVAC setters ---

  const setTemperature = (temp: number) => {
    setState('hvac', 'temperature', Math.max(16, Math.min(30, temp)));
  };

  const setFanSpeed = (speed: FanSpeed) => {
    setState('hvac', 'fanSpeed', speed);
  };

  const setAcOn = (on: boolean) => {
    setState('hvac', 'acOn', on);
  };

  const setZoneTemperature = (index: number, temp: number) => {
    setState('hvac', 'zones', index, 'temperature', Math.max(16, Math.min(30, temp)));
  };

  const setZoneEnabled = (index: number, enabled: boolean) => {
    setState('hvac', 'zones', index, 'enabled', enabled);
  };

  // --- Window setters ---

  const setWindowPosition = (index: number, position: number) => {
    setState('windows', index, 'position', Math.max(0, Math.min(100, position)));
  };

  const setAllWindows = (position: number) => {
    const clamped = Math.max(0, Math.min(100, position));
    state.windows.forEach((_, i) => {
      setState('windows', i, 'position', clamped);
    });
  };

  // --- Seat setters ---

  const setSeatHeating = (index: number, level: number) => {
    setState('seats', index, 'heating', Math.max(0, Math.min(3, level)));
  };

  const setSeatCooling = (index: number, level: number) => {
    setState('seats', index, 'cooling', Math.max(0, Math.min(3, level)));
  };

  const setSeatMassage = (index: number, mode: MassageMode) => {
    setState('seats', index, 'massage', mode);
  };

  // --- Lighting setters ---

  const setInteriorLight = (on: boolean) => {
    setState('lighting', 'interior', 'on', on);
  };

  const setInteriorBrightness = (brightness: number) => {
    setState('lighting', 'interior', 'brightness', Math.max(0, Math.min(100, brightness)));
  };

  const setAmbientColor = (color: string) => {
    setState('lighting', 'ambient', 'color', color);
  };

  const setAmbientBrightness = (brightness: number) => {
    setState('lighting', 'ambient', 'brightness', Math.max(0, Math.min(100, brightness)));
  };

  const setReadingLight = (on: boolean) => {
    setState('lighting', 'reading', 'on', on);
  };

  // --- Media setters ---

  const setVolume = (volume: number) => {
    setState('media', 'volume', Math.max(0, Math.min(100, volume)));
  };

  const setMediaSource = (source: MediaSource) => {
    setState('media', 'source', source);
  };

  const setPlaying = (playing: boolean) => {
    setState('media', 'playing', playing);
  };

  // --- Vehicle info setters ---

  const setSpeed = (speed: number) => {
    setState('info', 'speed', Math.max(0, speed));
  };

  const setBattery = (battery: number) => {
    setState('info', 'battery', Math.max(0, Math.min(100, battery)));
  };

  const setRange = (range: number) => {
    setState('info', 'range', Math.max(0, range));
  };

  const setOdometer = (odometer: number) => {
    setState('info', 'odometer', odometer);
  };

  const setTirePressure = (tire: 'fl' | 'fr' | 'rl' | 'rr', pressure: number) => {
    setState('info', 'tirePressure', tire, pressure);
  };

  const setOutsideTemp = (temp: number) => {
    setState('info', 'outsideTemp', temp);
  };

  const setChargingStatus = (charging: boolean) => {
    setState('info', 'chargingStatus', charging);
  };

  // --- Query methods ---

  const getHvacInfo = (): string => {
    const h = state.hvac;
    const zones = h.zones
      .map((z) => `${z.name}: ${z.temperature}°C (${z.enabled ? 'on' : 'off'})`)
      .join(', ');
    return `Temperature: ${h.temperature}°C, Fan: ${h.fanSpeed}, AC: ${h.acOn ? 'on' : 'off'}, Zones: [${zones}]`;
  };

  const getWindowInfo = (): string => {
    return state.windows
      .map((w) => `${w.name}: ${w.position}%`)
      .join(', ');
  };

  const getSeatInfo = (): string => {
    return state.seats
      .map((s) => `${s.name}: heating=${s.heating}, cooling=${s.cooling}, massage=${s.massage}`)
      .join('; ');
  };

  const getLightingInfo = (): string => {
    const l = state.lighting;
    return `Interior: ${l.interior.on ? 'on' : 'off'} (${l.interior.brightness}%), Ambient: ${l.ambient.color} (${l.ambient.brightness}%), Reading: ${l.reading.on ? 'on' : 'off'}`;
  };

  const getMediaInfo = (): string => {
    const m = state.media;
    return `Volume: ${m.volume}, Source: ${m.source}, ${m.playing ? 'Playing' : 'Paused'}`;
  };

  const getVehicleInfo = (): string => {
    const i = state.info;
    const tp = i.tirePressure;
    return `Speed: ${i.speed} km/h, Battery: ${i.battery}%, Range: ${i.range} km, Odometer: ${i.odometer} km, Tire Pressure: FL=${tp.fl} FR=${tp.fr} RL=${tp.rl} RR=${tp.rr}, Outside Temp: ${i.outsideTemp}°C, Charging: ${i.chargingStatus ? 'yes' : 'no'}`;
  };

  const getFullStatus = (): string => {
    return [
      `[HVAC] ${getHvacInfo()}`,
      `[Windows] ${getWindowInfo()}`,
      `[Seats] ${getSeatInfo()}`,
      `[Lighting] ${getLightingInfo()}`,
      `[Media] ${getMediaInfo()}`,
      `[Vehicle] ${getVehicleInfo()}`,
    ].join('\n');
  };

  return {
    state,

    // HVAC
    setTemperature,
    setFanSpeed,
    setAcOn,
    setZoneTemperature,
    setZoneEnabled,

    // Windows
    setWindowPosition,
    setAllWindows,

    // Seats
    setSeatHeating,
    setSeatCooling,
    setSeatMassage,

    // Lighting
    setInteriorLight,
    setInteriorBrightness,
    setAmbientColor,
    setAmbientBrightness,
    setReadingLight,

    // Media
    setVolume,
    setMediaSource,
    setPlaying,

    // Vehicle info
    setSpeed,
    setBattery,
    setRange,
    setOdometer,
    setTirePressure,
    setOutsideTemp,
    setChargingStatus,

    // Query
    getHvacInfo,
    getWindowInfo,
    getSeatInfo,
    getLightingInfo,
    getMediaInfo,
    getVehicleInfo,
    getFullStatus,
  };
}

export const vehicleStore = createRoot(createVehicleStore);
