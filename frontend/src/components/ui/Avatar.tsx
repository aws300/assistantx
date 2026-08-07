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
import { Component, JSX, splitProps, Show, createSignal, onMount } from 'solid-js';
import { cn } from '@/lib/utils';

const getNameColor = (name: string): string => {
  let num = 0;
  for (let i = 0; i < name.length; i++) {
    num += name.charCodeAt(i);
  }
  return `hsl(${num % 360}, 60%, 75%)`;
};

const getInitials = (name: string): string => {
  if (!name) return '?';
  let initials = '';
  if (/[\u4e00-\u9fa5]/.test(name)) {
    const chineseName = name.match(/[\u4e00-\u9fa5]+/g);
    if (chineseName && chineseName.length > 1) {
      initials = chineseName[chineseName.length - 2].slice(-1) + chineseName[chineseName.length - 1].slice(-1);
    } else if (chineseName && chineseName.length === 1) {
      initials = chineseName[0].slice(-2);
    }
  } else {
    const words = name.trim().split(' ');
    if (words.length > 1) {
      initials = words[0].charAt(0) + words[1].charAt(0);
    } else {
      initials = name.substring(0, 2);
    }
  }
  return initials.toUpperCase();
};

interface AvatarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  name?: string;
}

const sizeMap = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
  xl: 'size-16',
};

const fontSizeMap = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
};

export const Avatar: Component<AvatarProps> = (props) => {
  const [local, rest] = splitProps(props, ['src', 'alt', 'fallback', 'size', 'class', 'name']);
  const [imageLoaded, setImageLoaded] = createSignal(false);
  const [imageError, setImageError] = createSignal(false);

  const displayName = () => local.name || local.alt || '';
  const initials = () => local.fallback || getInitials(displayName());
  const bgColor = () => displayName() ? getNameColor(displayName()) : 'hsl(0, 0%, 70%)';

  onMount(() => {
    setImageLoaded(false);
    setImageError(false);
  });

  const showImage = () => local.src && !imageError();

  return (
    <div
      class={cn(
        'rounded-full overflow-hidden border-2 border-white shadow-sm shrink-0 relative',
        sizeMap[local.size || 'md'],
        local.class
      )}
      {...rest}
    >
      <div
        class={cn(
          'absolute inset-0 flex items-center justify-center text-white font-medium',
          fontSizeMap[local.size || 'md']
        )}
        style={{ "background-color": bgColor() }}
      >
        {initials()}
      </div>
      <Show when={showImage()}>
        <img
          src={local.src}
          alt={local.alt || 'Avatar'}
          class={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            imageLoaded() ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      </Show>
    </div>
  );
};
