import { Component, Show } from 'solid-js';
import { cn } from '@/lib/utils';

interface GlassSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  unit?: string;
  class?: string;
}

export const GlassSlider: Component<GlassSliderProps> = (props) => {
  const percentage = () => ((props.value - props.min) / (props.max - props.min)) * 100;

  return (
    <div class={cn('w-full', props.class)}>
      <Show when={props.label || props.unit}>
        <div class="flex justify-between items-center mb-2">
          <Show when={props.label}>
            <span class="text-sm text-text-secondary">{props.label}</span>
          </Show>
          <span class="text-sm font-medium text-text-primary">
            {props.value}{props.unit ?? ''}
          </span>
        </div>
      </Show>
      <div class="relative">
        <div class="absolute inset-0 h-1.5 bg-black/10 rounded-full top-1/2 -translate-y-1/2" />
        <div
          class="absolute h-1.5 rounded-full top-1/2 -translate-y-1/2 bg-primary"
          style={{ width: `${percentage()}%` }}
        />
        <input
          type="range"
          value={props.value}
          onInput={(e) => props.onChange(Number(e.currentTarget.value))}
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          class="relative w-full h-6 bg-transparent cursor-pointer z-10 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
};
