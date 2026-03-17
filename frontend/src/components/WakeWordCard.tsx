/**
 * Wake Word Card - ONNX-based wake word detection with model loading progress.
 * Faithfully ported from the original React WakeWordCard.
 */

import { Component, createSignal, createEffect, onMount, onCleanup, Show, For, splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import {
  getWakeWordDetector,
  WakeWordDetector,
  type WakeWordType,
  type ModelLoadingState,
  WAKE_WORD_CONFIG,
} from '@/lib/wakeword';

interface WakeWordCardProps {
  dark?: boolean;
  class?: string;
  onDetected?: () => void;
  isSessionActive?: boolean;
}

const MODEL_KEYS = ['melspectrogram', 'embedding', 'wakeword', 'vad'] as const;

export const WakeWordCard: Component<WakeWordCardProps> = (rawProps) => {
  const [props] = splitProps(rawProps, ['dark', 'class', 'onDetected', 'isSessionActive']);

  const [currentWakeWord, setCurrentWakeWord] = createSignal<WakeWordType>('ok_computer');
  const [isListening, setIsListening] = createSignal(false);
  const [detected, setDetected] = createSignal(false);
  const [lastScore, setLastScore] = createSignal<number | null>(null);
  const [isSwitching, setIsSwitching] = createSignal(false);
  const [loadingState, setLoadingState] = createSignal<ModelLoadingState>({
    melspectrogram: 'idle',
    embedding: 'idle',
    wakeword: 'idle',
    vad: 'idle',
    overall: 'idle',
  });

  let detector: WakeWordDetector | null = null;
  let detectionTimeout: ReturnType<typeof setTimeout> | undefined;

  // Initialize detector on mount
  onMount(async () => {
    detector = getWakeWordDetector({
      onStatusChange: (state: ModelLoadingState) => {
        setLoadingState({ ...state });
      },
      onDetection: (score: number, wakeWord: WakeWordType) => {
        setDetected(true);
        setLastScore(score);
        console.log(`[WakeWordCard] Detected "${WAKE_WORD_CONFIG[wakeWord].name}" score=${score.toFixed(3)}`);
        props.onDetected?.();

        if (detectionTimeout) clearTimeout(detectionTimeout);
        detectionTimeout = setTimeout(() => setDetected(false), 1500);
      },
      detectionThreshold: 0.5,
      initialWakeWord: 'ok_computer',
    });

    // Do NOT auto-initialize on mount. User must click "开始" to start.
    // Models will be loaded on first toggle click.
  });

  // Pause/resume when session state changes
  createEffect(() => {
    if (!detector) return;
    const state = detector.getLoadingState();
    if (state.overall !== 'ready') return;

    if (props.isSessionActive) {
      if (detector.getIsListening()) {
        detector.stopListening();
        setIsListening(false);
      }
    } else {
      if (!detector.getIsListening()) {
        detector.startListening().then(() => setIsListening(true)).catch(() => {});
      }
    }
  });

  const handleToggle = async () => {
    if (!detector || props.isSessionActive) return;
    const state = detector.getLoadingState();

    // If models not loaded yet, initialize first
    if (state.overall !== 'ready') {
      try {
        await detector.initialize();
        await detector.startListening();
        setIsListening(true);
      } catch (e) {
        console.error('[WakeWordCard] Init on toggle failed:', e);
      }
      return;
    }

    if (isListening()) {
      detector.stopListening();
      setIsListening(false);
    } else {
      try {
        await detector.startListening();
        setIsListening(true);
      } catch (e) {
        console.error('[WakeWordCard] Start failed:', e);
      }
    }
  };

  const handleWakeWordChange = async (ww: WakeWordType) => {
    if (!detector || ww === currentWakeWord() || props.isSessionActive) return;
    setIsSwitching(true);
    try {
      await detector.switchWakeWord(ww);
      setCurrentWakeWord(ww);
      setIsListening(detector.getIsListening());
    } catch (e) {
      console.error('[WakeWordCard] Switch failed:', e);
    } finally {
      setIsSwitching(false);
    }
  };

  onCleanup(() => {
    if (detector) detector.dispose();
    if (detectionTimeout) clearTimeout(detectionTimeout);
  });

  // Status info
  const statusInfo = () => {
    if (props.isSessionActive) {
      return { text: '会话中已暂停', color: 'text-gray-400', dot: 'bg-gray-400', animate: false };
    }
    if (isSwitching()) {
      return { text: '切换唤醒词中...', color: 'text-amber-600', dot: 'bg-amber-500', animate: true };
    }
    const ls = loadingState();
    if (ls.overall === 'loading') {
      const loaded = MODEL_KEYS.filter((k) => ls[k] === 'ready').length;
      return { text: `加载模型中 (${loaded}/4)`, color: 'text-amber-600', dot: 'bg-amber-500', animate: true };
    }
    if (ls.overall === 'error') {
      return { text: '加载失败', color: 'text-red-500', dot: 'bg-red-500', animate: false };
    }
    if (ls.overall === 'ready') {
      if (detected()) {
        return { text: `检测到! (${((lastScore() ?? 0) * 100).toFixed(0)}%)`, color: 'text-primary', dot: 'bg-primary', animate: true };
      }
      if (isListening()) {
        return { text: '正在监听...', color: 'text-primary', dot: 'bg-primary', animate: true };
      }
      return { text: '已就绪', color: 'text-gray-500', dot: 'bg-gray-400', animate: false };
    }
    return { text: '初始化...', color: 'text-gray-400', dot: 'bg-gray-300', animate: true };
  };

  const isReady = () => loadingState().overall === 'ready' && !isSwitching();

  return (
    <div class={cn('relative', props.class)}>
      {/* Detection glow */}
      <div
        class={cn(
          'absolute inset-0 rounded-2xl transition-all duration-500',
          detected() ? 'bg-primary/20 shadow-[0_0_40px_5px_rgba(var(--primary-rgb),0.3)]' : '',
        )}
      />

      <div
        class={cn(
          'relative overflow-hidden rounded-2xl transition-all duration-500',
          props.dark
            ? 'bg-black/20 backdrop-blur-xl border border-white/10'
            : 'bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)]',
          detected() && 'border-primary/30',
        )}
      >
        <div class="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-slate-100/30 pointer-events-none" />

        <div class="relative px-6 py-5">
          {/* Header */}
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                  detected()
                    ? 'bg-primary/10 text-primary'
                    : isListening()
                      ? 'bg-primary/10 text-primary'
                      : 'bg-gray-100 text-gray-500',
                )}
              >
                <Show
                  when={loadingState().overall !== 'loading' && !isSwitching()}
                  fallback={<Icon name="progress_activity" size="md" class="animate-spin" />}
                >
                  <Icon name={isListening() ? 'mic' : 'mic_off'} size="md" />
                </Show>
              </div>
              <div>
                <h3 class={cn('font-semibold', props.dark ? 'text-white/90' : 'text-gray-800')}>
                  {WAKE_WORD_CONFIG[currentWakeWord()].name}
                </h3>
                <p class={cn('text-xs', props.dark ? 'text-white/40' : 'text-gray-500')}>唤醒词</p>
              </div>
            </div>

            <button
              class={cn(
                'px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                (!isReady() && loadingState().overall !== 'idle') || props.isSessionActive
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : isListening()
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-primary/10 text-primary hover:bg-primary/20',
              )}
              onClick={handleToggle}
              disabled={props.isSessionActive}
            >
              {isListening() ? '停止' : '开始'}
            </button>
          </div>

          {/* Wake word selector */}
          <div class="flex gap-2 mb-4">
            <For each={Object.keys(WAKE_WORD_CONFIG) as WakeWordType[]}>
              {(ww) => (
                <button
                  class={cn(
                    'flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer',
                    ww === currentWakeWord()
                      ? props.dark ? 'bg-white/20 text-white shadow-md' : 'bg-slate-800 text-white shadow-md'
                      : props.dark ? 'bg-white/5 text-white/50 hover:bg-white/10' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ((!isReady() && ww !== currentWakeWord()) || props.isSessionActive) && 'opacity-50 cursor-not-allowed',
                  )}
                  onClick={() => handleWakeWordChange(ww)}
                  disabled={(!isReady() && ww !== currentWakeWord()) || props.isSessionActive}
                >
                  {WAKE_WORD_CONFIG[ww].name}
                </button>
              )}
            </For>
          </div>

          {/* Status */}
          <div class="flex items-center gap-2">
            <div class="relative">
              <div class={cn('w-2 h-2 rounded-full transition-colors', statusInfo().dot)} />
              <Show when={statusInfo().animate}>
                <div class={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-75', statusInfo().dot)} />
              </Show>
            </div>
            <span class={cn('text-sm', statusInfo().color)}>{statusInfo().text}</span>
          </div>

          {/* Model loading progress bars */}
          <Show when={loadingState().overall === 'loading'}>
            <div class="mt-3 grid grid-cols-4 gap-1">
              <For each={[...MODEL_KEYS]}>
                {(model) => (
                  <div
                    class={cn(
                      'h-1 rounded-full transition-all duration-300',
                      loadingState()[model] === 'ready' ? 'bg-primary' : 'bg-gray-200',
                    )}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default WakeWordCard;
