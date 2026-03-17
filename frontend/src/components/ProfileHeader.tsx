import { Component, Show, For, createSignal } from 'solid-js';
import { authStore, guestMode } from '@/stores/auth';
import { themeStore, themes, type ThemeColor } from '@/stores/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Dropdown';
import { cn } from '@/lib/utils';

const themeOptions: ThemeColor[] = ['blue', 'pink', 'purple'];

interface ProfileHeaderProps {
  class?: string;
}

const ProfileHeader: Component<ProfileHeaderProps> = (props) => {
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
    <div class={cn('z-10 flex items-center', props.class)}>
      <Popover
        trigger={
          <button class="flex items-center gap-3 pl-1 hover:opacity-80 transition-opacity">
            <Avatar
              src={currentUser().picture}
              alt={currentUser().name}
              name={currentUser().name}
              size="sm"
              class="!size-9"
            />
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
              <p class="text-sm font-semibold text-text-primary truncate">{currentUser().name}</p>
              <Show when={currentUser().email}>
                <p class="text-xs text-text-muted truncate">{currentUser().email}</p>
              </Show>
            </div>
          </div>

          {/* Theme dots */}
          <div class={cn(
            'flex items-center justify-around py-3',
            !guestMode && 'border-b border-black/10'
          )}>
            <For each={themeOptions}>
              {(themeId) => {
                const config = themes[themeId];
                const isSelected = () => themeStore.currentTheme() === themeId;
                return (
                  <button
                    class={cn(
                      'w-4 h-4 rounded-full transition-opacity duration-150',
                      isSelected() ? 'opacity-100' : 'opacity-40 hover:opacity-70'
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

export default ProfileHeader;
