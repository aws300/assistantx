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
import { Component, JSX, splitProps } from 'solid-js';
import { cn } from '@/lib/utils';

interface IconProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  filled?: boolean;
}

const sizeMap = {
  xs: 'text-[14px]',
  sm: 'text-[16px]',
  md: 'text-[20px]',
  lg: 'text-[24px]',
  xl: 'text-[28px]',
};

export const Icon: Component<IconProps> = (props) => {
  const [local, rest] = splitProps(props, ['name', 'size', 'filled', 'class']);

  return (
    <span
      class={cn(
        'material-symbols-outlined select-none',
        sizeMap[local.size || 'md'],
        local.filled && '[font-variation-settings:"FILL"_1]',
        local.class
      )}
      {...rest}
    >
      {local.name}
    </span>
  );
};
