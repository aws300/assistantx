import { Component, Show, For, createSignal, onMount } from 'solid-js';
import { authStore, guestMode } from '@/stores/auth';
import { themeStore, themes, type ThemeColor } from '@/stores/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Dropdown';
import { cn } from '@/lib/utils';
import { irsaClient } from '@/api/client';
import { ConnectError, Code as ConnectCode } from '@connectrpc/connect';
import type { IRSAInfo } from '@/gen/irsa/v1/irsa_pb';

const themeOptions: ThemeColor[] = ['blue', 'pink', 'purple'];

const Home: Component = () => {
  const [profileOpen, setProfileOpen] = createSignal(false);
  const [irsaInfo, setIrsaInfo] = createSignal<IRSAInfo | null>(null);
  const [irsaLoading, setIrsaLoading] = createSignal(false);
  const [irsaError, setIrsaError] = createSignal('');
  const [irsaNotConfigured, setIrsaNotConfigured] = createSignal(false);

  const currentUser = () => ({
    name: guestMode ? 'Guest' : (authStore.userInfo()?.name || ''),
    email: guestMode ? '' : (authStore.userInfo()?.email || ''),
    picture: guestMode ? '' : (authStore.userInfo()?.picture || ''),
  });

  const handleLogout = async () => {
    setProfileOpen(false);
    await authStore.logout();
  };

  onMount(async () => {
    setIrsaLoading(true);
    try {
      const info = await irsaClient.getIRSAInfo({});
      setIrsaInfo(info);
      if (info.error) setIrsaError(info.error);
    } catch (e: any) {
      if (e instanceof ConnectError && e.code === ConnectCode.Unimplemented) {
        setIrsaNotConfigured(true);
      } else {
        setIrsaError(e?.message || 'Failed to fetch IRSA info');
      }
    } finally {
      setIrsaLoading(false);
    }
  });

  return (
    <div class="aurora" style="height:100dvh;width:100dvw;position:relative;overflow:hidden;">

      {/* Top-right header area */}
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
                <p class="text-sm font-semibold text-text-primary truncate">{currentUser().name}</p>
                <Show when={currentUser().email}>
                  <p class="text-xs text-text-muted truncate">{currentUser().email}</p>
                </Show>
              </div>
            </div>

            {/* Theme dots — 3 bare circles, evenly spaced */}
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

            {/* Logout — hidden in guest mode */}
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

      {/* Centered IRSA info card */}
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-xl rounded-2xl bg-white/70 backdrop-blur-md shadow-xl border border-white/40 p-6">
          <h2 class="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
            AWS IRSA Info
          </h2>

          {/* Loading */}
          <Show when={irsaLoading()}>
            <p class="text-sm text-text-muted animate-pulse">Loading AWS identity…</p>
          </Show>

          {/* No IRSA configured (CodeUnimplemented from backend) */}
          <Show when={!irsaLoading() && irsaNotConfigured()}>
            <p class="text-sm text-text-muted opacity-60 select-none">IRSA not configured — set <Code>irsaRoleArn</Code> in Helm values</p>
          </Show>

          {/* Error only (no partial data) */}
          <Show when={!irsaLoading() && irsaError() && !irsaInfo()?.callerIdentity}>
            <p class="text-sm text-red-500 break-all">{irsaError()}</p>
          </Show>

          {/* Caller identity */}
          <Show when={!irsaLoading() && irsaInfo()?.callerIdentity}>
            <Section title="Caller Identity">
              <Row label="Account">{irsaInfo()!.callerIdentity!.account}</Row>
              <Row label="User ID">{irsaInfo()!.callerIdentity!.userId}</Row>
              <Row label="ARN"><Code>{irsaInfo()!.callerIdentity!.arn}</Code></Row>
            </Section>
          </Show>

          {/* Role info */}
          <Show when={!irsaLoading() && irsaInfo()?.roleInfo}>
            <Section title="IAM Role">
              <Row label="Name">{irsaInfo()!.roleInfo!.roleName}</Row>
              <Row label="ARN"><Code>{irsaInfo()!.roleInfo!.roleArn}</Code></Row>
              <Row label="Role ID">{irsaInfo()!.roleInfo!.roleId}</Row>
              <Show when={irsaInfo()!.roleInfo!.description}>
                <Row label="Description">{irsaInfo()!.roleInfo!.description}</Row>
              </Show>
              <Row label="Created">{irsaInfo()!.roleInfo!.createDate}</Row>
            </Section>
          </Show>

          {/* Attached policies */}
          <Show when={!irsaLoading() && (irsaInfo()?.attachedPolicies?.length ?? 0) > 0}>
            <Section title="Attached Policies">
              <For each={irsaInfo()!.attachedPolicies}>
                {(p) => (
                  <div class="flex items-start justify-between gap-2 py-1">
                    <span class="text-xs font-medium text-text-primary">{p.policyName}</span>
                    <Code small>{p.policyArn}</Code>
                  </div>
                )}
              </For>
            </Section>
          </Show>

          {/* Inline policy names */}
          <Show when={!irsaLoading() && (irsaInfo()?.inlinePolicyNames?.length ?? 0) > 0}>
            <Section title="Inline Policies">
              <For each={irsaInfo()!.inlinePolicyNames}>
                {(name) => <Row label="Policy">{name}</Row>}
              </For>
            </Section>
          </Show>

          {/* Partial error */}
          <Show when={!irsaLoading() && irsaError() && irsaInfo()?.callerIdentity}>
            <p class="mt-3 text-xs text-orange-500 bg-orange-50 rounded-lg px-3 py-2 break-all">
              ⚠ Partial error: {irsaError()}
            </p>
          </Show>

          {/* No IRSA (neither loading nor data nor configured) */}
          <Show when={!irsaLoading() && !irsaNotConfigured() && !irsaInfo()?.callerIdentity && !irsaError()}>
            <p class="text-sm text-text-muted opacity-60 select-none">No IRSA credentials detected</p>
          </Show>
        </div>
      </div>

    </div>
  );
};

// ---- Small helper components ----

const Section: Component<{ title: string; children: any }> = (props) => (
  <div class="mb-4">
    <p class="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">{props.title}</p>
    <div class="rounded-xl bg-black/5 px-3 py-2 space-y-1">
      {props.children}
    </div>
  </div>
);

const Row: Component<{ label: string; children: any }> = (props) => (
  <div class="flex items-start justify-between gap-3 py-0.5">
    <span class="text-xs text-text-muted shrink-0 w-24">{props.label}</span>
    <span class="text-xs text-text-primary text-right flex-1 min-w-0 break-all">{props.children}</span>
  </div>
);

const Code: Component<{ children: any; small?: boolean }> = (props) => (
  <span class={cn(
    'font-mono bg-black/10 rounded px-1 py-0.5 break-all',
    props.small ? 'text-[10px]' : 'text-xs'
  )}>
    {props.children}
  </span>
);

export default Home;
