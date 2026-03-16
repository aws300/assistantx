import { Component, JSX, Show, createSignal, For } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

interface DropdownProps {
  trigger: JSX.Element;
  items: DropdownItem[];
  align?: 'left' | 'right';
  position?: 'bottom' | 'top';
}

export const Dropdown: Component<DropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
      document.removeEventListener('click', handleClickOutside);
    }
  };

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    item.onClick?.();
    setOpen(false);
  };

  const isTop = () => props.position === 'top';

  return (
    <div class="relative inline-block" ref={containerRef}>
      <div onClick={() => {
        const next = !open();
        setOpen(next);
        if (next) {
          setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
        } else {
          document.removeEventListener('click', handleClickOutside);
        }
      }}>
        {props.trigger}
      </div>

      <Show when={open()}>
        <div
          class={cn(
            'absolute z-[200] min-w-[200px] glass-dropdown rounded-xl p-1.5',
            props.align === 'right' ? 'right-0' : 'left-0',
            isTop() ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <For each={props.items}>
            {(item) => (
              <Show
                when={!item.divider}
                fallback={<div class="h-px bg-black/10 my-1.5 mx-2" />}
              >
                <button
                  class={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-colors text-left',
                    item.danger
                      ? 'text-red-500 hover:bg-red-500/10'
                      : 'text-text-secondary hover:bg-black/5 hover:text-text-primary',
                    item.disabled && 'opacity-50 pointer-events-none'
                  )}
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                >
                  <Show when={item.icon}>
                    <Icon name={item.icon!} size="sm" />
                  </Show>
                  {item.label}
                </button>
              </Show>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// Popover — used for the profile dropdown in the header
interface PopoverProps {
  trigger: JSX.Element;
  children: JSX.Element;
  align?: 'left' | 'right' | 'center';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Popover: Component<PopoverProps> = (props) => {
  const [internalOpen, setInternalOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const isOpen = () => props.open ?? internalOpen();
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    props.onOpenChange?.(value);
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
      document.removeEventListener('click', handleClickOutside);
    }
  };

  return (
    <div class="relative inline-block" ref={containerRef}>
      <div onClick={() => {
        const newState = !isOpen();
        setOpen(newState);
        if (newState) {
          setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
        } else {
          document.removeEventListener('click', handleClickOutside);
        }
      }}>
        {props.trigger}
      </div>

      <Show when={isOpen()}>
        <div
          class={cn(
            'absolute z-[200] mt-2 glass-dropdown rounded-xl p-4',
            props.align === 'right' && 'right-0',
            props.align === 'center' && 'left-1/2 -translate-x-1/2',
            (!props.align || props.align === 'left') && 'left-0'
          )}
        >
          {props.children}
        </div>
      </Show>
    </div>
  );
};
