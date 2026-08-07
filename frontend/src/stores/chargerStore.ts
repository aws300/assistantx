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
import { createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';

// --- Types ---

export type ChargingStatus = 'charging' | 'idle' | 'paused' | 'completed';

export interface ChargerStatusState {
  status: ChargingStatus;
  soc: number;        // state of charge, 0-100
  targetSoc: number;  // target state of charge, 0-100
}

export interface ElectricalData {
  voltage: number;    // volts
  current: number;    // amps
  power: number;      // kW
  totalEnergy: number; // kWh
}

export interface BatteryData {
  estimatedTime: number; // minutes remaining
}

export interface TemperatureData {
  connector: number;  // °C
  module: number;     // °C
  ambient: number;    // °C
}

export interface BillingData {
  rate: number;         // cost per kWh
  currentCost: number;  // accumulated cost
}

export interface ChargerState {
  status: ChargerStatusState;
  electrical: ElectricalData;
  battery: BatteryData;
  temperature: TemperatureData;
  billing: BillingData;
}

// --- Store ---

function createChargerStore() {
  const [state, setState] = createStore<ChargerState>({
    status: {
      status: 'idle',
      soc: 65,
      targetSoc: 80,
    },
    electrical: {
      voltage: 400,
      current: 32,
      power: 12.8,
      totalEnergy: 25.6,
    },
    battery: {
      estimatedTime: 45,
    },
    temperature: {
      connector: 35,
      module: 42,
      ambient: 28,
    },
    billing: {
      rate: 0.85,
      currentCost: 21.76,
    },
  });

  // --- Status setters ---

  const setChargingStatus = (status: ChargingStatus) => {
    setState('status', 'status', status);
  };

  const setSoc = (soc: number) => {
    setState('status', 'soc', Math.max(0, Math.min(100, soc)));
  };

  const setTargetSoc = (targetSoc: number) => {
    setState('status', 'targetSoc', Math.max(0, Math.min(100, targetSoc)));
  };

  // --- Electrical setters ---

  const setVoltage = (voltage: number) => {
    setState('electrical', 'voltage', Math.max(0, voltage));
  };

  const setCurrent = (current: number) => {
    setState('electrical', 'current', Math.max(0, current));
  };

  const setPower = (power: number) => {
    setState('electrical', 'power', Math.max(0, power));
  };

  const setTotalEnergy = (energy: number) => {
    setState('electrical', 'totalEnergy', Math.max(0, energy));
  };

  // --- Battery setter ---

  const setEstimatedTime = (minutes: number) => {
    setState('battery', 'estimatedTime', Math.max(0, minutes));
  };

  // --- Temperature setters ---

  const setConnectorTemp = (temp: number) => {
    setState('temperature', 'connector', temp);
  };

  const setModuleTemp = (temp: number) => {
    setState('temperature', 'module', temp);
  };

  const setAmbientTemp = (temp: number) => {
    setState('temperature', 'ambient', temp);
  };

  // --- Billing setters ---

  const setRate = (rate: number) => {
    setState('billing', 'rate', Math.max(0, rate));
  };

  const setCurrentCost = (cost: number) => {
    setState('billing', 'currentCost', Math.max(0, cost));
  };

  // --- Charging control actions ---

  const startCharging = () => {
    setState('status', 'status', 'charging');
  };

  const stopCharging = () => {
    setState('status', 'status', 'idle');
    setState('electrical', { voltage: 0, current: 0, power: 0 });
  };

  const pauseCharging = () => {
    setState('status', 'status', 'paused');
    setState('electrical', { current: 0, power: 0 });
  };

  const resumeCharging = () => {
    setState('status', 'status', 'charging');
  };

  // --- Query methods ---

  const getStatusInfo = (): string => {
    const s = state.status;
    return `Status: ${s.status}, SOC: ${s.soc}%, Target: ${s.targetSoc}%`;
  };

  const getElectricalInfo = (): string => {
    const e = state.electrical;
    return `Voltage: ${e.voltage}V, Current: ${e.current}A, Power: ${e.power}kW, Total Energy: ${e.totalEnergy}kWh`;
  };

  const getBatteryInfo = (): string => {
    return `Estimated Time: ${state.battery.estimatedTime} min`;
  };

  const getTemperatureInfo = (): string => {
    const t = state.temperature;
    return `Connector: ${t.connector}°C, Module: ${t.module}°C, Ambient: ${t.ambient}°C`;
  };

  const getBillingInfo = (): string => {
    const b = state.billing;
    return `Rate: ${b.rate}/kWh, Current Cost: ${b.currentCost}`;
  };

  const getFullStatus = (): string => {
    return [
      `[Status] ${getStatusInfo()}`,
      `[Electrical] ${getElectricalInfo()}`,
      `[Battery] ${getBatteryInfo()}`,
      `[Temperature] ${getTemperatureInfo()}`,
      `[Billing] ${getBillingInfo()}`,
    ].join('\n');
  };

  return {
    state,

    // Status
    setChargingStatus,
    setSoc,
    setTargetSoc,

    // Electrical
    setVoltage,
    setCurrent,
    setPower,
    setTotalEnergy,

    // Battery
    setEstimatedTime,

    // Temperature
    setConnectorTemp,
    setModuleTemp,
    setAmbientTemp,

    // Billing
    setRate,
    setCurrentCost,

    // Charging control actions
    startCharging,
    stopCharging,
    pauseCharging,
    resumeCharging,

    // Query
    getStatusInfo,
    getElectricalInfo,
    getBatteryInfo,
    getTemperatureInfo,
    getBillingInfo,
    getFullStatus,
  };
}

export const chargerStore = createRoot(createChargerStore);
