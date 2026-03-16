import { createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';

// --- Types ---

export type HvacMode = 'cool' | 'heat' | 'auto' | 'fan' | 'dry';
export type HomeFanSpeed = 'low' | 'medium' | 'high' | 'auto';

export interface HomeInfo {
  weather: string;
  outsideTemp: number;
  insideTemp: number;
  humidity: number;
  pm25: number;
}

export interface HomeHvac {
  power: boolean;
  targetTemp: number;
  mode: HvacMode;
  fanSpeed: HomeFanSpeed;
}

export interface HomeLights {
  livingRoom: boolean;
  bedroom: boolean;
  kitchen: boolean;
  bathroom: boolean;
}

export interface HomeState {
  info: HomeInfo;
  hvac: HomeHvac;
  lights: HomeLights;
  curtainPosition: number; // 0 = fully closed, 100 = fully open
}

// --- Store ---

function createHomeStore() {
  const [state, setState] = createStore<HomeState>({
    info: {
      weather: '晴',
      outsideTemp: 28,
      insideTemp: 24,
      humidity: 55,
      pm25: 35,
    },
    hvac: {
      power: false,
      targetTemp: 24,
      mode: 'cool',
      fanSpeed: 'auto',
    },
    lights: {
      livingRoom: false,
      bedroom: false,
      kitchen: false,
      bathroom: false,
    },
    curtainPosition: 0,
  });

  // --- Info setters ---

  const setWeather = (weather: string) => {
    setState('info', 'weather', weather);
  };

  const setOutsideTemp = (temp: number) => {
    setState('info', 'outsideTemp', temp);
  };

  const setInsideTemp = (temp: number) => {
    setState('info', 'insideTemp', temp);
  };

  const setHumidity = (humidity: number) => {
    setState('info', 'humidity', Math.max(0, Math.min(100, humidity)));
  };

  const setPm25 = (pm25: number) => {
    setState('info', 'pm25', Math.max(0, pm25));
  };

  // --- HVAC setters ---

  const setHvacPower = (power: boolean) => {
    setState('hvac', 'power', power);
  };

  const setTargetTemp = (temp: number) => {
    setState('hvac', 'targetTemp', Math.max(16, Math.min(30, temp)));
  };

  const setHvacMode = (mode: HvacMode) => {
    setState('hvac', 'mode', mode);
  };

  const setFanSpeed = (speed: HomeFanSpeed) => {
    setState('hvac', 'fanSpeed', speed);
  };

  // --- Light setters ---

  const setLight = (room: keyof HomeLights, on: boolean) => {
    setState('lights', room, on);
  };

  const setAllLights = (on: boolean) => {
    setState('lights', {
      livingRoom: on,
      bedroom: on,
      kitchen: on,
      bathroom: on,
    });
  };

  // --- Curtain setter ---

  const setCurtainPosition = (position: number) => {
    setState('curtainPosition', Math.max(0, Math.min(100, position)));
  };

  // --- Query methods ---

  const getHomeInfo = (): string => {
    const i = state.info;
    return `Weather: ${i.weather}, Outside: ${i.outsideTemp}°C, Inside: ${i.insideTemp}°C, Humidity: ${i.humidity}%, PM2.5: ${i.pm25}`;
  };

  const getHvacInfo = (): string => {
    const h = state.hvac;
    return `Power: ${h.power ? 'on' : 'off'}, Target: ${h.targetTemp}°C, Mode: ${h.mode}, Fan: ${h.fanSpeed}`;
  };

  const getLightsInfo = (): string => {
    const l = state.lights;
    const rooms = [
      `Living Room: ${l.livingRoom ? 'on' : 'off'}`,
      `Bedroom: ${l.bedroom ? 'on' : 'off'}`,
      `Kitchen: ${l.kitchen ? 'on' : 'off'}`,
      `Bathroom: ${l.bathroom ? 'on' : 'off'}`,
    ];
    return rooms.join(', ');
  };

  const getCurtainInfo = (): string => {
    return `Curtain: ${state.curtainPosition}% open`;
  };

  const getFullStatus = (): string => {
    return [
      `[Home] ${getHomeInfo()}`,
      `[HVAC] ${getHvacInfo()}`,
      `[Lights] ${getLightsInfo()}`,
      `[Curtain] ${getCurtainInfo()}`,
    ].join('\n');
  };

  return {
    state,

    // Info
    setWeather,
    setOutsideTemp,
    setInsideTemp,
    setHumidity,
    setPm25,

    // HVAC
    setHvacPower,
    setTargetTemp,
    setHvacMode,
    setFanSpeed,

    // Lights
    setLight,
    setAllLights,

    // Curtain
    setCurtainPosition,

    // Query
    getHomeInfo,
    getHvacInfo,
    getLightsInfo,
    getCurtainInfo,
    getFullStatus,
  };
}

export const homeStore = createRoot(createHomeStore);
