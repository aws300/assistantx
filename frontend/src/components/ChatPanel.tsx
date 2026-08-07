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
 * Chat Panel Component
 * Right-side floating overlay for LiveKit voice and text chat.
 *
 * States:
 *   - Collapsed: small bar with icon + "语音助手" + connection status + chevron
 *   - Expanded (idle): audio icon animation, "点击下方按钮开始对话", "开始对话" button
 *   - Expanded (connected): transcription messages, text input, mic/speaker/disconnect controls
 */

import {
  Component,
  createSignal,
  createEffect,
  onCleanup,
  Show,
  For,
  splitProps,
} from 'solid-js';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type ConnectionState,
} from 'livekit-client';
import { livekitClient } from '@/api/client';
import { executeAction, setSessionDisconnectCallback } from '@/skills/ActionExecutor';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SceneType = 'car' | 'home' | 'charger';

interface ChatPanelProps {
  scene: SceneType;
  onAction?: (action: { id: string; params: Record<string, any> }) => Record<string, any> | void;
  class?: string;
  dark?: boolean;
  /** Reactive trigger: when flipped to true, auto-expand and connect */
  autoStart?: () => boolean;
  /** Called when voice session starts (connected to LiveKit) */
  onSessionStart?: () => void;
  /** Called when voice session ends (disconnected) */
  onSessionEnd?: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

const SILENCE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatPanel: Component<ChatPanelProps> = (rawProps) => {
  const [props] = splitProps(rawProps, ['scene', 'onAction', 'class', 'dark', 'autoStart', 'onSessionStart', 'onSessionEnd']);

  // -- Signals --
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [agentStatus, setAgentStatus] = createSignal<AgentStatus>('idle');
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [textInput, setTextInput] = createSignal('');
  const [isMicOn, setIsMicOn] = createSignal(true);
  const [isSpeakerOn, setIsSpeakerOn] = createSignal(true);
  const [error, setError] = createSignal('');

  let room: Room | null = null;
  let messagesEndRef: HTMLDivElement | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  // Watch autoStart trigger from wake word detection
  createEffect(() => {
    const shouldStart = props.autoStart?.();
    if (shouldStart && !isConnected() && !isConnecting()) {
      console.log('[ChatPanel] Auto-start triggered by wake word');
      setIsExpanded(true);
      // Delay to let wake word release mic before we acquire it
      setTimeout(() => {
        connect();
      }, 500);
    }
  });

  // -- Auto-scroll --
  const scrollToBottom = () => {
    messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
  };

  createEffect(() => {
    messages(); // track
    scrollToBottom();
  });

  // -- Silence timeout --
  const resetSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (isConnected()) {
        console.warn('[ChatPanel] 5-min silence timeout -- disconnecting');
        disconnect();
      }
    }, SILENCE_TIMEOUT_MS);
  };

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = undefined;
    }
  };

  // -- Status helpers --
  const statusLabel = () => {
    if (isConnecting()) return '连接中...';
    if (isConnected()) return '已连接';
    return '未连接';
  };

  const agentStatusText = () => {
    switch (agentStatus()) {
      case 'listening':
        return '正在听...';
      case 'thinking':
        return '思考中...';
      case 'speaking':
        return '回复中...';
      default:
        return '';
    }
  };

  // -- Connect --
  const connect = async () => {
    if (isConnecting() || isConnected()) return;
    setIsConnecting(true);
    setIsExpanded(true);
    setError('');

    // Notify session start IMMEDIATELY so wake word stops listening
    props.onSessionStart?.();

    try {
      const resp = await livekitClient.getToken({ scene: props.scene });

      room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // --- Register session disconnect callbacks ---
      setSessionDisconnectCallback(
        () => {
          console.log('[ChatPanel] Session disconnect triggered by agent');
          if (room) room.disconnect();
        },
        () => {
          console.log('[ChatPanel] Preparing to disconnect');
          if (room) room.localParticipant.setMicrophoneEnabled(false);
        },
      );

      // --- Room events ---
      room.on(RoomEvent.Connected, () => {
        setIsConnected(true);
        setIsConnecting(false);
        props.onSessionStart?.();
        setIsExpanded(true);
        setAgentStatus('listening');
        resetSilenceTimer();
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setIsExpanded(false);
        setAgentStatus('idle');
        clearSilenceTimer();
        props.onSessionEnd?.();
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        if (participant.identity.startsWith('agent')) {
          setAgentStatus('listening');
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio && participant.identity.startsWith('agent')) {
          const audioEl = track.attach();
          audioEl.volume = isSpeakerOn() ? 1 : 0;
          document.body.appendChild(audioEl);
          setAgentStatus('speaking');
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const agentSpeaking = speakers.some((s) => s.identity?.startsWith('agent'));
        if (agentSpeaking) {
          setAgentStatus('speaking');
          // Resume any paused audio elements (after text interruption)
          document.querySelectorAll('audio').forEach((el) => {
            const audioEl = el as HTMLAudioElement;
            if (audioEl.paused && audioEl.srcObject) {
              audioEl.play().catch(() => {});
            }
          });
        } else if (isConnected()) {
          setAgentStatus('listening');
        }
        resetSilenceTimer();
      });

      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        for (const segment of segments) {
          if (segment.final && segment.text.trim()) {
            const role = participant?.identity?.startsWith('agent') ? 'assistant' : 'user';
            setMessages((prev) => [...prev, { role, text: segment.text.trim() }]);
          }
        }
        resetSilenceTimer();
      });

      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const text = new TextDecoder().decode(payload);
          const data = JSON.parse(text);
          if (data.type === 'agent_status') {
            setAgentStatus(data.status);
          }
        } catch {
          /* ignore */
        }
      });

      // --- RPC handler ---
      room.localParticipant.registerRpcMethod('executeAction', async (data) => {
        try {
          const action = JSON.parse(data.payload);
          console.log('[ChatPanel RPC] executeAction:', action);

          if (props.onAction) {
            const result = props.onAction(action);
            return JSON.stringify(result || { success: true });
          }

          const result = await executeAction(action);
          return JSON.stringify(result);
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      });

      const token = resp.participantToken || resp.token;
      await room.connect(resp.serverUrl, token);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to connect');
      setIsConnecting(false);
    }
  };

  // -- Disconnect --
  const disconnect = async () => {
    clearSilenceTimer();
    if (room) {
      await room.disconnect();
      room = null;
    }
    setIsConnected(false);
    setIsExpanded(false);
    setAgentStatus('idle');
    props.onSessionEnd?.();
  };

  // -- Mic toggle --
  const toggleMic = async () => {
    if (!room) return;
    const next = !isMicOn();
    setIsMicOn(next);
    await room.localParticipant.setMicrophoneEnabled(next);
  };

  // -- Speaker toggle --
  const toggleSpeaker = async () => {
    const next = !isSpeakerOn();
    setIsSpeakerOn(next);

    if (room) {
      try {
        const agentParticipant = Array.from(room.remoteParticipants.values()).find((p) =>
          p.identity.startsWith('agent'),
        );
        if (agentParticipant) {
          await room.localParticipant.performRpc({
            destinationIdentity: agentParticipant.identity,
            method: 'setAudioOutput',
            payload: JSON.stringify({ enabled: next }),
          });
        }
      } catch {
        /* ignore */
      }
    }

    document.querySelectorAll('audio').forEach((el) => {
      (el as HTMLAudioElement).volume = next ? 1 : 0;
    });
  };

  // -- Interrupt agent audio (pause without destroying) --
  const interruptAgentAudio = () => {
    // Pause all audio elements — don't remove or detach tracks
    // The track remains subscribed so new audio from the agent will resume playback
    document.querySelectorAll('audio').forEach((el) => {
      const audioEl = el as HTMLAudioElement;
      audioEl.pause();
      audioEl.currentTime = 0;
    });
    console.log('[ChatPanel] Interrupted agent audio');
  };

  // -- Send text --
  const sendText = async () => {
    const text = textInput().trim();
    if (!text || !room) return;
    setTextInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);

    // Pause current agent audio immediately (will resume with new response)
    interruptAgentAudio();
    setAgentStatus('thinking');

    // Send via both channels for immediate + framework handling
    // 1. publishData: fast direct delivery to agent's data_received handler
    try {
      const encoder = new TextEncoder();
      const payload = JSON.stringify({ type: 'text_input', text });
      await room.localParticipant.publishData(encoder.encode(payload), { reliable: true });
      console.log('[ChatPanel] Sent via publishData:', text);
    } catch (e) {
      console.warn('[ChatPanel] publishData failed:', e);
    }
    // 2. sendChatMessage: LiveKit chat protocol for turn-taking/interruption
    try {
      await room.localParticipant.sendChatMessage(text);
      console.log('[ChatPanel] Sent via sendChatMessage:', text);
    } catch (e) {
      console.warn('[ChatPanel] sendChatMessage failed:', e);
    }
    resetSilenceTimer();
  };

  // -- Cleanup --
  onCleanup(() => {
    clearSilenceTimer();
    if (room) room.disconnect();
  });

  // -- Render --
  return (
    <div
      class={cn(
        'fixed right-4 bottom-4 z-50 flex flex-col w-[350px] rounded-2xl overflow-hidden transition-all duration-300',
        props.dark
          ? 'bg-[#1a1d29ee] border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
          : 'border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
        !props.dark && 'backdrop-blur-[30px] [backdrop-filter:blur(30px)_saturate(180%)]',
        !props.dark && 'bg-[#ffffffd9]',
        props.class,
      )}
    >
      {/* ── Collapsed Header Bar ──────────────────────────────────── */}
      <div
        class={cn(
          'flex items-center justify-between px-4 py-3 cursor-pointer select-none',
          isExpanded() && (props.dark ? 'border-b border-white/10' : 'border-b border-gray-200/50'),
        )}
        onClick={() => setIsExpanded(!isExpanded())}
      >
        <div class="flex items-center gap-3">
          <div class="relative">
            <Icon
              name="chat_bubble"
              size="sm"
              class={cn(
                isConnected() ? 'text-sky-500' : props.dark ? 'text-white/60' : 'text-gray-500',
              )}
            />
            <Show when={isConnected()}>
              <div class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400" />
            </Show>
          </div>
          <span
            class={cn(
              'text-sm font-medium',
              props.dark ? 'text-white/90' : 'text-gray-800',
            )}
          >
            语音助手
          </span>
          <span
            class={cn(
              'text-xs',
              isConnected()
                ? 'text-sky-500'
                : isConnecting()
                  ? 'text-amber-500'
                  : props.dark
                    ? 'text-white/40'
                    : 'text-gray-400',
            )}
          >
            {statusLabel()}
          </span>
        </div>
        <Icon
          name={isExpanded() ? 'expand_more' : 'expand_less'}
          size="sm"
          class={props.dark ? 'text-white/50' : 'text-gray-400'}
        />
      </div>

      {/* ── Expanded Content ──────────────────────────────────────── */}
      <Show when={isExpanded()}>
        {/* ── Connected: messages + input ── */}
        <Show when={isConnected()}>
          {/* Agent status indicator */}
          <Show when={agentStatusText()}>
            <div
              class={cn(
                'flex items-center justify-center gap-2 py-2 text-xs font-medium',
                props.dark ? 'bg-white/5 text-white/60' : 'bg-sky-50 text-sky-600',
              )}
            >
              <div
                class={cn(
                  'w-1.5 h-1.5 rounded-full animate-pulse',
                  agentStatus() === 'speaking'
                    ? 'bg-blue-500'
                    : agentStatus() === 'thinking'
                      ? 'bg-amber-500'
                      : 'bg-green-500',
                )}
              />
              {agentStatusText()}
            </div>
          </Show>

          {/* Messages area */}
          <div class="flex-1 overflow-y-auto p-4 space-y-3 max-h-64 min-h-[8rem]">
            <Show
              when={messages().length > 0}
              fallback={
                <div class="text-center py-8">
                  <Icon
                    name="volume_up"
                    size="xl"
                    class={cn(
                      'mx-auto mb-2',
                      props.dark ? 'text-white/30' : 'text-sky-300',
                    )}
                  />
                  <p
                    class={cn(
                      'text-sm font-medium',
                      props.dark ? 'text-white/60' : 'text-gray-600',
                    )}
                  >
                    开始对话
                  </p>
                  <p
                    class={cn(
                      'text-xs mt-1',
                      props.dark ? 'text-white/30' : 'text-gray-400',
                    )}
                  >
                    说话或输入文字
                  </p>
                </div>
              }
            >
              <For each={messages()}>
                {(msg) => (
                  <div class={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      class={cn(
                        'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
                        msg.role === 'user'
                          ? 'bg-sky-500 text-white rounded-br-md'
                          : props.dark
                            ? 'bg-white/10 text-white/90 rounded-bl-md'
                            : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md',
                      )}
                    >
                      <p class="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                )}
              </For>
              <div ref={messagesEndRef} />
            </Show>
          </div>

          {/* Input area */}
          <div
            class={cn(
              'p-3 border-t',
              props.dark ? 'border-white/10 bg-black/10' : 'border-gray-200/30 bg-gray-50/50',
            )}
          >
            {/* Text input row */}
            <div class="flex items-center gap-2">
              <input
                type="text"
                class={cn(
                  'flex-1 rounded-full px-4 py-2.5 text-sm outline-none border transition-colors',
                  props.dark
                    ? 'bg-white/10 text-white placeholder-white/40 border-white/10 focus:border-white/30'
                    : 'bg-white/80 backdrop-blur-sm text-gray-800 placeholder-gray-400 border-gray-200/60 focus:border-sky-400 focus:ring-2 focus:ring-sky-100',
                )}
                placeholder={
                  agentStatus() === 'listening'
                    ? '正在聆听...'
                    : agentStatus() === 'speaking'
                      ? '助手回复中...'
                      : '输入消息...'
                }
                value={textInput()}
                onInput={(e) => setTextInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendText()}
              />

              {/* Send button - glass pill */}
              <button
                class={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                  textInput().trim()
                    ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm'
                    : props.dark
                      ? 'bg-white/10 text-white/30'
                      : 'bg-white/60 backdrop-blur-sm text-gray-400 border border-gray-200/50',
                )}
                onClick={sendText}
                disabled={!textInput().trim()}
              >
                <Icon name="send" size="sm" />
              </button>
            </div>

            {/* Control buttons row - Apple glass morphism */}
            <div class="flex items-center justify-between mt-3">
              <div class="flex items-center gap-2">
                {/* Mic button */}
                <button
                  class={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                    'backdrop-blur-sm border shadow-sm',
                    isMicOn()
                      ? 'bg-sky-500/90 text-white border-sky-400/50'
                      : props.dark
                        ? 'bg-white/10 text-white/50 border-white/10'
                        : 'bg-white/60 text-gray-500 border-gray-200/50 hover:bg-white/80',
                  )}
                  onClick={toggleMic}
                  title={isMicOn() ? '静音' : '取消静音'}
                >
                  <Icon name={isMicOn() ? 'mic' : 'mic_off'} size="sm" />
                </button>

                {/* Speaker button */}
                <button
                  class={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                    'backdrop-blur-sm border shadow-sm',
                    isSpeakerOn()
                      ? props.dark
                        ? 'bg-blue-500/30 text-blue-400 border-blue-400/30'
                        : 'bg-sky-50/80 text-sky-600 border-sky-200/50'
                      : props.dark
                        ? 'bg-white/10 text-white/40 border-white/10'
                        : 'bg-amber-50/80 text-amber-600 border-amber-200/50',
                  )}
                  onClick={toggleSpeaker}
                  title={isSpeakerOn() ? '静音扬声器' : '取消静音扬声器'}
                >
                  <Icon name={isSpeakerOn() ? 'volume_up' : 'volume_off'} size="sm" />
                </button>
              </div>

              {/* Status text */}
              <span
                class={cn(
                  'text-xs',
                  props.dark ? 'text-white/40' : 'text-gray-400',
                )}
              >
                {agentStatusText() || '就绪'}
              </span>

              {/* Disconnect button - red glass */}
              <button
                class={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                  'bg-red-500/90 text-white border border-red-400/50 shadow-sm',
                  'hover:bg-red-600/90',
                )}
                onClick={disconnect}
                title="断开连接"
              >
                <Icon name="call_end" size="sm" />
              </button>
            </div>
          </div>
        </Show>

        {/* ── Not connected: idle view ── */}
        <Show when={!isConnected()}>
          <div class="flex flex-col items-center justify-center p-6 min-h-[12rem]">
            {/* Animated audio icon */}
            <div
              class={cn(
                'w-16 h-16 mb-4 rounded-full flex items-center justify-center',
                props.dark
                  ? 'bg-white/10 border border-white/20'
                  : 'bg-gradient-to-br from-sky-50 to-blue-100 border border-white/80 shadow-sm',
              )}
            >
              <Icon
                name="volume_up"
                size="lg"
                class={cn(
                  isConnecting() && 'animate-pulse',
                  props.dark ? 'text-white/60' : 'text-sky-400',
                )}
              />
            </div>

            <p
              class={cn(
                'font-medium mb-1',
                props.dark ? 'text-white/80' : 'text-gray-600',
              )}
            >
              语音助手
            </p>
            <p
              class={cn(
                'text-xs mb-4',
                props.dark ? 'text-white/40' : 'text-gray-400',
              )}
            >
              点击下方按钮开始对话
            </p>

            <button
              class={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all',
                isConnecting()
                  ? props.dark
                    ? 'bg-white/10 text-white/60'
                    : 'bg-sky-100 text-sky-600'
                  : 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm',
              )}
              onClick={connect}
              disabled={isConnecting()}
            >
              <Icon
                name="phone_in_talk"
                size="sm"
                class={isConnecting() ? 'animate-pulse' : ''}
              />
              {isConnecting() ? '连接中...' : '开始对话'}
            </button>

            <Show when={error()}>
              <p class="text-xs text-red-500 mt-3">{error()}</p>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default ChatPanel;
