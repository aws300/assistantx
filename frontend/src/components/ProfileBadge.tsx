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
/**
 * ProfileBadge -- floating user avatar + name badge fixed at bottom-right.
 *
 * Clicking opens a popover with user info, theme color dots, and logout.
 * Reuses the same profile popover pattern from Landing.tsx.
 */

import { Component, Show, For, createSignal, splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Popover } from '@/components/ui/Dropdown';
import { authStore, guestMode } from '@/stores/auth';
import { themeStore, themes, type ThemeColor } from '@/stores/theme';

const themeOptions: ThemeColor[] = ['blue', 'pink', 'purple'];

interface ProfileBadgeProps {
  class?: string;
}

const ProfileBadge: Component<ProfileBadgeProps> = (rawProps) => {
  const [props] = splitProps(rawProps, ['class']);
  const [profileOpen, setProfileOpen] = createSignal(false);

  const currentUser = () => ({
    name: guestMode ? 'Guest' : (authStore.userInfo()?.name || ''),
    email: guestMode ? '' : (authStore.userInfo()?.email || ''),
    picture: guestMode ? '' : (authStore.userInfo()?.picture || ''),
  });

  const handleLogout = async () => {
    setProfileOpen(false);
    await authStore.logout();
  };

  return (
    <div class={cn('fixed top-4 right-4 z-50', props.class)}>
      <Popover
        trigger={
          <button class="flex items-center gap-2 px-2 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/60 shadow-lg hover:opacity-90 transition-opacity">
            <Avatar
              src={currentUser().picture}
              alt={currentUser().name}
              name={currentUser().name}
              size="sm"
              class="!size-8"
            />
            <Show when={currentUser().name}>
              <span class="text-sm font-medium text-gray-700 pr-2 max-w-[120px] truncate">
                {currentUser().name}
              </span>
            </Show>
          </button>
        }
        align="right"
        open={profileOpen()}
        onOpenChange={setProfileOpen}
      >
        <div class="w-[200px]">
          {/* User info */}
          <div class="flex items-center gap-3 pb-3 border-b border-black/10">
            <Avatar
              src={currentUser().picture}
              alt={currentUser().name}
              name={currentUser().name}
              size="lg"
              class="shrink-0"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-text-primary truncate">
                {currentUser().name}
              </p>
              <Show when={currentUser().email}>
                <p class="text-xs text-text-muted truncate">{currentUser().email}</p>
              </Show>
            </div>
          </div>

          {/* Theme dots */}
          <div
            class={cn(
              'flex items-center justify-around py-3',
              !guestMode && 'border-b border-black/10',
            )}
          >
            <For each={themeOptions}>
              {(themeId) => {
                const config = themes[themeId];
                const isSelected = () => themeStore.currentTheme() === themeId;
                return (
                  <button
                    class={cn(
                      'w-4 h-4 rounded-full transition-opacity duration-150',
                      isSelected() ? 'opacity-100' : 'opacity-40 hover:opacity-70',
                    )}
                    style={{ 'background-color': config.primary }}
                    onClick={() => themeStore.setTheme(themeId)}
                    aria-label={themeId}
                  />
                );
              }}
            </For>
          </div>

          {/* Logout -- hidden in guest mode */}
          <Show when={!guestMode}>
            <div class="pt-2">
              <button
                class="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-sm font-medium transition-colors text-left text-red-500 hover:bg-red-500/10"
                onClick={handleLogout}
              >
                <Icon name="logout" size="sm" />
                Log out
              </button>
            </div>
          </Show>
        </div>
      </Popover>
    </div>
  );
};

export { ProfileBadge };
export default ProfileBadge;
