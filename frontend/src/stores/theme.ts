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
import { createSignal, createRoot } from 'solid-js';

export type ThemeColor = 'pink' | 'purple' | 'blue' | 'red' | 'green';

export interface ThemeConfig {
  id: ThemeColor;
  name: string;
  primary: string;
  primaryRgb: string;
  primaryHover: string;
  secondary: string;
  secondaryRgb: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  titleGradientFrom: string;
  titleGradientTo: string;
  auroraGlow1: string;
  auroraGlow2: string;
  auroraGradient1: string;
  auroraGradient2: string;
  auroraGradient3: string;
  auroraGradient4: string;
  auroraGradient5: string;
  auroraGradient6: string;
}

export const themes: Record<ThemeColor, ThemeConfig> = {
  pink: {
    id: 'pink',
    name: 'Pink',
    primary: '#ee2b6c',
    primaryRgb: '238, 43, 108',
    primaryHover: '#d6265f',
    secondary: '#f5d0dc',
    secondaryRgb: '245, 208, 220',
    textPrimary: '#1b0d12',
    textSecondary: '#5f303f',
    textMuted: '#9a4c66',
    titleGradientFrom: '#1b0d12',
    titleGradientTo: '#ee2b6c',
    auroraGlow1: '#ffc8dd',
    auroraGlow2: '#bde0fe',
    auroraGradient1: 'hsl(336, 83%, 91%)',
    auroraGradient2: 'hsla(250, 60%, 94%, 1)',
    auroraGradient3: 'hsl(339, 74%, 94%)',
    auroraGradient4: 'hsla(280, 60%, 94%, 1)',
    auroraGradient5: 'hsla(335, 80%, 90%, 1)',
    auroraGradient6: 'hsla(340, 100%, 96%, 1)',
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    primary: '#8b5cf6',
    primaryRgb: '139, 92, 246',
    primaryHover: '#7c3aed',
    secondary: '#ddd6fe',
    secondaryRgb: '221, 214, 254',
    textPrimary: '#1e1b4b',
    textSecondary: '#4c3d8f',
    textMuted: '#7c6bb5',
    titleGradientFrom: '#1e1b4b',
    titleGradientTo: '#8b5cf6',
    auroraGlow1: '#c4b5fd',
    auroraGlow2: '#a5b4fc',
    auroraGradient1: 'hsl(263, 70%, 91%)',
    auroraGradient2: 'hsla(240, 60%, 94%, 1)',
    auroraGradient3: 'hsl(270, 60%, 94%)',
    auroraGradient4: 'hsla(250, 60%, 94%, 1)',
    auroraGradient5: 'hsla(263, 70%, 90%, 1)',
    auroraGradient6: 'hsla(270, 80%, 96%, 1)',
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    primary: '#3b82f6',
    primaryRgb: '59, 130, 246',
    primaryHover: '#2563eb',
    secondary: '#bfdbfe',
    secondaryRgb: '191, 219, 254',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    titleGradientFrom: '#0f172a',
    titleGradientTo: '#3b82f6',
    auroraGlow1: '#93c5fd',
    auroraGlow2: '#a5f3fc',
    auroraGradient1: 'hsl(210, 70%, 91%)',
    auroraGradient2: 'hsla(200, 60%, 94%, 1)',
    auroraGradient3: 'hsl(215, 60%, 94%)',
    auroraGradient4: 'hsla(190, 60%, 94%, 1)',
    auroraGradient5: 'hsla(210, 70%, 90%, 1)',
    auroraGradient6: 'hsla(205, 80%, 96%, 1)',
  },
  red: {
    id: 'red',
    name: 'Red',
    primary: '#ef4444',
    primaryRgb: '239, 68, 68',
    primaryHover: '#dc2626',
    secondary: '#fecaca',
    secondaryRgb: '254, 202, 202',
    textPrimary: '#1c0808',
    textSecondary: '#5c2020',
    textMuted: '#9a4444',
    titleGradientFrom: '#1c0808',
    titleGradientTo: '#ef4444',
    auroraGlow1: '#fca5a5',
    auroraGlow2: '#fcd6bb',
    auroraGradient1: 'hsl(0, 75%, 91%)',
    auroraGradient2: 'hsla(20, 60%, 94%, 1)',
    auroraGradient3: 'hsl(355, 70%, 94%)',
    auroraGradient4: 'hsla(10, 60%, 94%, 1)',
    auroraGradient5: 'hsla(0, 70%, 91%, 1)',
    auroraGradient6: 'hsla(5, 80%, 96%, 1)',
  },
  green: {
    id: 'green',
    name: 'Green',
    primary: '#22c55e',
    primaryRgb: '34, 197, 94',
    primaryHover: '#16a34a',
    secondary: '#bbf7d0',
    secondaryRgb: '187, 247, 208',
    textPrimary: '#052e16',
    textSecondary: '#1a5632',
    textMuted: '#4d8b62',
    titleGradientFrom: '#052e16',
    titleGradientTo: '#22c55e',
    auroraGlow1: '#86efac',
    auroraGlow2: '#a7f3d0',
    auroraGradient1: 'hsl(142, 60%, 90%)',
    auroraGradient2: 'hsla(160, 50%, 94%, 1)',
    auroraGradient3: 'hsl(148, 55%, 93%)',
    auroraGradient4: 'hsla(170, 50%, 94%, 1)',
    auroraGradient5: 'hsla(142, 60%, 89%, 1)',
    auroraGradient6: 'hsla(150, 70%, 96%, 1)',
  },
};

function createThemeStore() {
  // Load from localStorage, default to blue
  const getInitialTheme = (): ThemeColor => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'pink' || saved === 'purple' || saved === 'blue' || saved === 'red' || saved === 'green') {
        return saved as ThemeColor;
      }
    }
    return 'blue';
  };

  const [currentTheme, setCurrentThemeSignal] = createSignal<ThemeColor>(getInitialTheme());

  const applyTheme = (themeId: ThemeColor) => {
    const theme = themes[themeId];
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--primary', theme.primary);
      root.style.setProperty('--primary-rgb', theme.primaryRgb);
      root.style.setProperty('--primary-hover', theme.primaryHover);
      root.style.setProperty('--secondary', theme.secondary);
      root.style.setProperty('--secondary-rgb', theme.secondaryRgb);
      root.style.setProperty('--text-primary', theme.textPrimary);
      root.style.setProperty('--text-secondary', theme.textSecondary);
      root.style.setProperty('--text-muted', theme.textMuted);
      root.style.setProperty('--title-gradient-from', theme.titleGradientFrom);
      root.style.setProperty('--title-gradient-to', theme.titleGradientTo);
      root.style.setProperty('--aurora-glow-1', theme.auroraGlow1);
      root.style.setProperty('--aurora-glow-2', theme.auroraGlow2);
      root.style.setProperty('--aurora-gradient-1', theme.auroraGradient1);
      root.style.setProperty('--aurora-gradient-2', theme.auroraGradient2);
      root.style.setProperty('--aurora-gradient-3', theme.auroraGradient3);
      root.style.setProperty('--aurora-gradient-4', theme.auroraGradient4);
      root.style.setProperty('--aurora-gradient-5', theme.auroraGradient5);
      root.style.setProperty('--aurora-gradient-6', theme.auroraGradient6);
    }
  };

  const setTheme = (themeId: ThemeColor) => {
    setCurrentThemeSignal(themeId);
    applyTheme(themeId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', themeId);
    }
  };

  const getThemeConfig = () => themes[currentTheme()];

  const initTheme = () => {
    applyTheme(currentTheme());
  };

  return { currentTheme, setTheme, getThemeConfig, initTheme, themes };
}

export const themeStore = createRoot(createThemeStore);
