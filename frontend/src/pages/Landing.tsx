import { Component, For, Show, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Popover } from '@/components/ui/Dropdown';
import { cn } from '@/lib/utils';
import { authStore, guestMode } from '@/stores/auth';
import { themeStore, themes, type ThemeColor } from '@/stores/theme';

const themeOptions: ThemeColor[] = ['blue', 'pink', 'purple'];

interface SceneConfig {
  title: string;
  description: string;
  path: string;
  gradient: string;
  updateTime: string;
}

const scenes: SceneConfig[] = [
  {
    title: '智能座舱',
    description:
      '车载语音交互系统，支持空调、车窗、座椅、灯光等 20+ 功能的自然语言控制，让驾驶更安全便捷',
    path: '/car',
    gradient: 'linear-gradient(180deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
    updateTime: '2026-01-15',
  },
  {
    title: '智能家居',
    description:
      '全屋智能语音控制平台，轻松管理空调、灯光、窗帘等设备，打造舒适便捷的智能生活体验',
    path: '/home',
    gradient: 'linear-gradient(180deg, #4facfe 0%, #00f2fe 100%)',
    updateTime: '2026-02-08',
  },
  {
    title: '智能 IoT (充电桩)',
    description:
      '智能充电桩管理系统，实时监控充电状态、远程控制充电参数、查询历史数据，让充电管理更高效',
    path: '/charger',
    gradient: 'linear-gradient(180deg, #fa709a 0%, #fee140 100%)',
    updateTime: '2026-01-28',
  },
];

interface FeatureConfig {
  icon: string;
  title: string;
  description: string;
  color: string;
}

const features: FeatureConfig[] = [
  { icon: 'mic', title: '实时语音交互', description: '唤醒词激活，低延迟对话', color: 'text-blue-400' },
  { icon: 'language', title: '多场景支持', description: '车载、家居、IoT 全覆盖', color: 'text-green-400' },
  { icon: 'settings_suggest', title: '动态技能加载', description: 'YAML 配置，灵活扩展', color: 'text-purple-400' },
  { icon: 'cloud', title: '云原生架构', description: 'Kubernetes + AWS', color: 'text-orange-400' },
];

const Landing: Component = () => {
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
    <div class="min-h-screen bg-gradient-to-br from-[#0f1419] via-[#1a1d29] to-[#0f1419] relative">
      {/* Left gradient bar - full height */}
      <div
        class="fixed left-0 top-0 bottom-0 w-2"
        style={{
          background:
            'linear-gradient(180deg, #667eea 0%, #764ba2 30%, #f093fb 60%, #fa709a 100%)',
        }}
      />

      {/* Top-right profile popover */}
      <div class="absolute top-4 right-4 z-10 flex items-center">
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
                !guestMode && 'border-b border-black/10'
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

      <div class="max-w-7xl mx-auto px-6 py-12 md:py-20 pl-8">
        {/* Header */}
        <header class="mb-16">
          <h1 class="text-4xl md:text-5xl font-bold text-white mb-2">
            Assistant X 演示场景列表
          </h1>
        </header>

        {/* Scene Cards Grid */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          <For each={scenes}>
            {(scene) => (
              <A
                href={scene.path}
                class="group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.01] no-underline block"
              >
                {/* Gradient border on the left */}
                <div
                  class="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl z-10"
                  style={{ background: scene.gradient }}
                />

                {/* Card content */}
                <div class="relative bg-[#1e2230] border border-[#2a2f3f] rounded-2xl p-8 pl-10 h-full transition-all duration-300 group-hover:bg-[#23283a] group-hover:border-[#3a3f5f] flex flex-col">
                  {/* Title */}
                  <h3 class="text-2xl font-bold text-white mb-4">{scene.title}</h3>

                  {/* Description */}
                  <p class="text-gray-400 text-base mb-6 leading-relaxed flex-1">
                    {scene.description}
                  </p>

                  {/* Update time */}
                  <div class="text-sm text-gray-500 mt-auto">
                    更新于 {scene.updateTime}
                  </div>
                </div>
              </A>
            )}
          </For>
        </div>

        {/* Features Section */}
        <div class="border-t border-gray-800 pt-12">
          <h2 class="text-2xl font-bold text-white mb-8 text-center">核心特性</h2>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
            <For each={features}>
              {(feat) => (
                <div class="text-center">
                  <div class="w-14 h-14 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center mx-auto mb-3">
                    <Icon name={feat.icon} size="lg" class={feat.color} />
                  </div>
                  <h3 class="font-semibold text-white text-sm mb-1">{feat.title}</h3>
                  <p class="text-xs text-gray-500">{feat.description}</p>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Footer */}
        <footer class="text-center mt-12 pt-8 border-t border-gray-800">
          <p class="text-xs text-gray-600">
            Voice Control System v1.0.0 | Powered by AWS Nova Sonic 2
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Landing;
