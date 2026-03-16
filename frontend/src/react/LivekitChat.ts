/**
 * React-based LiveKit Chat Panel (micro-island)
 *
 * Uses React.createElement (no JSX) to avoid conflicts with SolidJS JSX transform.
 * Leverages official @livekit/components-react hooks for proper turn-taking,
 * audio management, and text chat interruption.
 *
 * Design: Apple glass morphism with Material Symbols icons.
 * Animations: LiveKit BarVisualizer for speaking, custom pulse/dots for other states.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import {
  RoomContext,
  RoomAudioRenderer,
  useVoiceAssistant,
  useLocalParticipant,
  useChat,
  useTranscriptions,
  BarVisualizer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteParticipant,
} from 'livekit-client';
import { livekitClient } from '../api/client';
import {
  executeAction,
  setSessionDisconnectCallback,
  type ActionPayload,
} from '../skills/ActionExecutor';

const h = React.createElement;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SceneType = 'car' | 'home' | 'charger';

export interface ChatHandle {
  connect: () => void;
  disconnect: () => void;
  unmount: () => void;
}

interface MountOptions {
  scene: SceneType;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

// ---------------------------------------------------------------------------
// Material Icon helper
// ---------------------------------------------------------------------------

function icon(name: string, size = 20, extra?: React.CSSProperties) {
  return h('span', {
    className: 'material-symbols-outlined',
    style: { fontSize: `${size}px`, lineHeight: 1, ...extra },
  }, name);
}

function iconFilled(name: string, size = 20, extra?: React.CSSProperties) {
  return h('span', {
    className: 'material-symbols-outlined',
    style: {
      fontSize: `${size}px`, lineHeight: 1,
      fontVariationSettings: '"FILL" 1',
      ...extra,
    },
  }, name);
}

// ---------------------------------------------------------------------------
// Inject panel-specific CSS (animations, scrollbar, etc.)
// ---------------------------------------------------------------------------

const PANEL_CSS = `
@keyframes lk-chat-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.8); opacity: 0; }
}
@keyframes lk-chat-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}
@keyframes lk-chat-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.lk-chat-panel-messages::-webkit-scrollbar { width: 4px; }
.lk-chat-panel-messages::-webkit-scrollbar-track { background: transparent; }
.lk-chat-panel-messages::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.08); border-radius: 4px;
}
.lk-chat-panel-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(0,0,0,0.15);
}
.lk-chat-msg-enter {
  animation: lk-chat-fade-in 0.25s ease-out;
}
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

function transcriptionToDisplay(
  t: { text: string; streamInfo: { id: string; timestamp: number }; participantInfo: { identity: string } },
  room: Room,
): DisplayMessage {
  const isLocal = t.participantInfo.identity === room.localParticipant.identity;
  return {
    id: t.streamInfo.id,
    role: isLocal ? 'user' : 'assistant',
    content: t.text,
    timestamp: t.streamInfo.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Agent Status Indicator (listening/thinking/speaking animations)
// ---------------------------------------------------------------------------

function AgentStatusIndicator({ state, audioTrack }: { state: string; audioTrack?: any }) {
  if (!state || state === 'idle' || state === 'disconnected') return null;

  const labelMap: Record<string, string> = {
    listening: '\u6b63\u5728\u8046\u542c',
    thinking: '\u601d\u8003\u4e2d',
    speaking: '\u56de\u590d\u4e2d',
    connecting: '\u8fde\u63a5\u4e2d',
    initializing: '\u521d\u59cb\u5316',
  };

  const colorMap: Record<string, string> = {
    listening: 'var(--primary, #0ea5e9)',
    thinking: '#f59e0b',
    speaking: '#3b82f6',
    connecting: '#9ca3af',
    initializing: '#9ca3af',
  };

  const color = colorMap[state] || '#9ca3af';

  // Speaking: use BarVisualizer with prominent animation
  if (state === 'speaking' && audioTrack) {
    return h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '12px', padding: '10px 16px',
        background: 'rgba(var(--primary-rgb, 59, 130, 246), 0.06)',
        borderBottom: '1px solid rgba(var(--primary-rgb, 59, 130, 246), 0.08)',
      },
    },
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', height: '28px',
          '--lk-va-bar-width': '4px',
          '--lk-va-bar-gap': '3px',
          '--lk-fg': 'var(--primary, #3b82f6)',
        } as any,
      },
        h(BarVisualizer, {
          state: 'speaking' as any,
          trackRef: audioTrack,
          barCount: 7,
          options: { minHeight: 3 },
          style: { height: '100%' },
        }),
      ),
      h('span', {
        style: { fontSize: '12px', fontWeight: 500, color: 'var(--primary, #3b82f6)' },
      }, labelMap[state] || state),
    );
  }

  // Thinking: bouncing dots
  if (state === 'thinking') {
    return h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '10px', padding: '8px 16px',
        background: 'rgba(245, 158, 11, 0.06)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.08)',
      },
    },
      h('div', { style: { display: 'flex', gap: '3px', alignItems: 'center' } },
        ...[0, 1, 2].map(i =>
          h('div', {
            key: i,
            style: {
              width: '5px', height: '5px', borderRadius: '50%',
              background: '#f59e0b',
              animation: `lk-chat-dot-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            },
          }),
        ),
      ),
      h('span', {
        style: { fontSize: '12px', fontWeight: 500, color: '#f59e0b' },
      }, labelMap[state]),
    );
  }

  // Listening: pulsing dot
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '10px', padding: '8px 16px',
      background: `color-mix(in srgb, ${color} 6%, transparent)`,
      borderBottom: `1px solid color-mix(in srgb, ${color} 8%, transparent)`,
    },
  },
    h('div', { style: { position: 'relative', width: '10px', height: '10px' } },
      h('div', {
        style: {
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
          animation: 'lk-chat-pulse 2s ease-in-out infinite',
        },
      }),
      h('div', {
        style: {
          position: 'absolute', inset: '2px', borderRadius: '50%', background: color,
        },
      }),
    ),
    h('span', {
      style: { fontSize: '12px', fontWeight: 500, color },
    }, labelMap[state] || state),
  );
}

// ---------------------------------------------------------------------------
// ChatInner: uses LiveKit hooks (must be inside RoomContext)
// ---------------------------------------------------------------------------

function ChatInner({ room, onDisconnect }: { room: Room; onDisconnect: () => void }) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Official LiveKit hooks
  const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const chat = useChat();
  const [speakerMuted, setSpeakerMuted] = useState(false);

  // Enable mic on mount
  useEffect(() => {
    if (!isMicrophoneEnabled) {
      localParticipant.setMicrophoneEnabled(true).catch(console.warn);
    }
  }, []);

  // Merge transcriptions + chat messages, deduplicate
  const allMessages: DisplayMessage[] = useMemo(() => {
    const msgs: DisplayMessage[] = [];
    for (const t of transcriptions) {
      msgs.push(transcriptionToDisplay(t, room));
    }
    for (const m of chat.chatMessages) {
      msgs.push({
        id: m.id ?? `chat-${m.timestamp}`,
        role: m.from?.isLocal ? 'user' : 'assistant',
        content: m.message,
        timestamp: m.timestamp,
      });
    }
    const seen = new Set<string>();
    const unique: DisplayMessage[] = [];
    for (const m of msgs) {
      if (!seen.has(m.id)) { seen.add(m.id); unique.push(m); }
    }
    return unique.sort((a, b) => a.timestamp - b.timestamp);
  }, [transcriptions, chat.chatMessages, room]);

  // Auto-scroll
  useEffect(() => {
    const t = setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [allMessages]);

  // Send text via useChat().send() -- proper turn-taking
  const handleSendText = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    try {
      await chat.send(text);
      console.log('[LivekitChat] Sent via useChat:', text);
    } catch (err) {
      console.error('[LivekitChat] Send failed:', err);
    }
    inputRef.current?.focus();
  }, [inputText, chat]);

  // Mic toggle
  const handleMicToggle = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      console.error('[LivekitChat] Mic toggle failed:', err);
    }
  }, [localParticipant, isMicrophoneEnabled]);

  // Speaker toggle - mutes local audio AND tells agent to stop TTS
  const handleSpeakerToggle = useCallback(async () => {
    const newMuted = !speakerMuted;
    setSpeakerMuted(newMuted);

    // Immediately mute/unmute all audio elements
    document.querySelectorAll('audio').forEach((el) => {
      (el as HTMLAudioElement).volume = newMuted ? 0 : 1;
    });

    // Also tell agent to stop TTS via RPC
    try {
      const agentP = Array.from(room.remoteParticipants.values()).find(
        (p: RemoteParticipant) => p.identity.includes('agent'),
      );
      if (agentP) {
        await room.localParticipant.performRpc({
          destinationIdentity: agentP.identity,
          method: 'setAudioOutput',
          payload: JSON.stringify({ enabled: !newMuted }),
        });
      }
    } catch (err) {
      console.error('[LivekitChat] Speaker toggle RPC failed:', err);
    }
  }, [room, speakerMuted]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
  }, [handleSendText]);

  // --- Render ---
  return h(React.Fragment, null,
    // Audio renderer -- KEY: manages audio + turn-taking automatically
    h(RoomAudioRenderer, null),

    // Agent status indicator with animations
    h(AgentStatusIndicator, { state: agentState, audioTrack: agentAudioTrack }),

    // Messages area
    h('div', {
      className: 'lk-chat-panel-messages',
      style: {
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        maxHeight: '280px', minHeight: '120px',
      },
    },
      allMessages.length === 0
        // Empty state
        ? h('div', {
            style: {
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '24px 0', gap: '8px',
            },
          },
            h('div', {
              style: {
                width: '52px', height: '52px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(var(--primary-rgb, 14,165,233), 0.08), rgba(var(--primary-rgb, 14,165,233), 0.15))',
                border: '1px solid rgba(var(--primary-rgb, 14,165,233), 0.12)',
              },
            }, icon('graphic_eq', 26, { color: 'var(--primary, #0ea5e9)' })),
            h('p', {
              style: { fontWeight: 500, fontSize: '14px', color: 'var(--text-primary, #1f2937)' },
            }, '\u5f00\u59cb\u5bf9\u8bdd'),
            h('p', {
              style: { fontSize: '12px', color: 'var(--text-muted, #9ca3af)' },
            }, '\u8bf4\u8bdd\u6216\u8f93\u5165\u6587\u5b57'),
          )
        // Messages
        : h(React.Fragment, null,
            ...allMessages.map((msg) =>
              h('div', {
                key: msg.id,
                className: 'lk-chat-msg-enter',
                style: {
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '8px',
                },
              },
                h('div', {
                  className: msg.role === 'user' ? 'glass-bubble-user' : 'glass-bubble-agent',
                  style: {
                    maxWidth: '82%', borderRadius: '16px', padding: '8px 14px',
                    fontSize: '13px', lineHeight: '1.5',
                    ...(msg.role === 'user'
                      ? { borderBottomRightRadius: '6px', color: 'var(--text-primary, #1f2937)' }
                      : { borderBottomLeftRadius: '6px', color: 'var(--text-primary, #1f2937)' }),
                  },
                },
                  h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, msg.content),
                ),
              ),
            ),
            // Inline BarVisualizer when agent is speaking (LiveKit demo style)
            agentState === 'speaking' && agentAudioTrack && h('div', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                marginBottom: '8px',
              },
            },
              h('div', {
                className: 'glass-bubble-agent',
                style: {
                  display: 'flex', alignItems: 'center', gap: '8px',
                  borderRadius: '16px', borderBottomLeftRadius: '6px',
                  padding: '10px 16px',
                },
              },
                h('div', {
                  style: {
                    display: 'flex', alignItems: 'center', height: '20px',
                    '--lk-va-bar-width': '3px',
                    '--lk-va-bar-gap': '2px',
                    '--lk-fg': 'var(--primary, #3b82f6)',
                  } as any,
                },
                  h(BarVisualizer, {
                    state: 'speaking' as any,
                    trackRef: agentAudioTrack,
                    barCount: 5,
                    options: { minHeight: 3 },
                    style: { height: '100%' },
                  }),
                ),
                h('span', {
                  style: { fontSize: '12px', color: 'var(--text-muted, #9ca3af)' },
                }, '\u6b63\u5728\u8bf4\u8bdd...'),
              ),
            ),
            h('div', { ref: messagesEndRef }),
          ),
    ),

    // Input area
    h('div', {
      style: {
        padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,0.4)',
        background: 'rgba(255,255,255,0.25)',
      },
    },
      // Input row
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        // Mic button
        h('button', {
          onClick: handleMicToggle,
          title: isMicrophoneEnabled ? '\u9759\u97f3\u9ea6\u514b\u98ce' : '\u5f00\u542f\u9ea6\u514b\u98ce',
          style: {
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', flexShrink: 0,
            transition: 'all 0.2s',
            ...(isMicrophoneEnabled
              ? {
                  background: 'var(--primary, #0ea5e9)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(var(--primary-rgb, 14,165,233), 0.3)',
                }
              : {
                  background: 'rgba(0,0,0,0.06)',
                  color: 'var(--text-muted, #6b7280)',
                }),
          },
        }, icon(isMicrophoneEnabled ? 'mic' : 'mic_off', 18)),

        // Text input
        h('div', {
          className: 'glass-input',
          style: {
            flex: 1, display: 'flex', alignItems: 'center',
            borderRadius: '20px', overflow: 'hidden',
          },
        },
          h('input', {
            ref: inputRef,
            type: 'text',
            value: inputText,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputText(e.target.value),
            onKeyDown: handleKeyDown,
            placeholder: agentState === 'listening' ? '\u6b63\u5728\u8046\u542c...' : agentState === 'speaking' ? '\u52a9\u624b\u56de\u590d\u4e2d...' : '\u8f93\u5165\u6d88\u606f...',
            disabled: chat.isSending,
            className: 'input-inner',
            style: {
              flex: 1, padding: '7px 14px', fontSize: '13px',
              color: 'var(--text-primary, #1f2937)',
              fontFamily: 'inherit',
            },
          }),
        ),

        // Send button
        h('button', {
          onClick: handleSendText,
          disabled: !inputText.trim() || chat.isSending,
          title: '\u53d1\u9001',
          style: {
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: inputText.trim() ? 'pointer' : 'default',
            flexShrink: 0, transition: 'all 0.2s',
            ...(inputText.trim()
              ? {
                  background: 'var(--primary, #0ea5e9)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(var(--primary-rgb, 14,165,233), 0.3)',
                }
              : {
                  background: 'rgba(0,0,0,0.04)',
                  color: 'rgba(0,0,0,0.2)',
                }),
          },
        }, icon('send', 18)),

        // Speaker toggle
        h('button', {
          onClick: handleSpeakerToggle,
          title: speakerMuted ? '\u5f00\u542f\u8bed\u97f3\u56de\u590d' : '\u5207\u6362\u6587\u5b57\u6a21\u5f0f',
          style: {
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(0,0,0,0.06)',
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s',
            background: speakerMuted
              ? 'rgba(245, 158, 11, 0.1)'
              : 'rgba(255,255,255,0.5)',
            color: speakerMuted ? '#d97706' : 'var(--text-muted, #6b7280)',
          },
        }, icon(speakerMuted ? 'volume_off' : 'volume_up', 18)),
      ),

      // Status + disconnect row
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '8px', padding: '0 2px',
        },
      },
        // Left: status
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '6px' },
        },
          h('div', {
            style: {
              width: '6px', height: '6px', borderRadius: '50%',
              background: agentState === 'speaking' ? '#3b82f6'
                : agentState === 'thinking' ? '#f59e0b'
                : agentState === 'listening' ? 'var(--primary, #22c55e)'
                : '#9ca3af',
            },
          }),
          h('span', {
            style: { fontSize: '11px', color: 'var(--text-muted, #9ca3af)' },
          }, speakerMuted ? '\u6587\u5b57\u6a21\u5f0f' : '\u8bed\u97f3\u6a21\u5f0f'),
        ),

        // Right: disconnect
        h('button', {
          onClick: onDisconnect,
          style: {
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', color: '#ef4444', background: 'none',
            border: 'none', cursor: 'pointer', padding: '4px 8px',
            borderRadius: '8px', transition: 'all 0.15s',
          },
          onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
          },
          onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = 'none';
          },
        },
          icon('call_end', 14, { color: '#ef4444' }),
          '\u65ad\u5f00\u8fde\u63a5',
        ),
      ),
    ),
  );
}

const ChatInnerComponent = React.memo(ChatInner);

// ---------------------------------------------------------------------------
// LivekitChatPanel: manages Room lifecycle + expand/collapse
// ---------------------------------------------------------------------------

const SILENCE_TIMEOUT_MS = 5 * 60 * 1000;

interface PanelProps {
  scene: SceneType;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  handleRef: (fns: { connect: () => void; disconnect: () => void }) => void;
}

function LivekitChatPanel({ scene, onSessionStart, onSessionEnd, handleRef }: PanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { injectCSS(); }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (roomRef.current) {
        console.warn('[LivekitChat] 5-min silence timeout');
        roomRef.current.disconnect();
      }
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  const connect = useCallback(async () => {
    if (connectionState === 'connecting' || connectionState === 'connected') return;
    setConnectionState('connecting');
    setIsExpanded(true);
    setError(null);
    onSessionStart?.();

    try {
      const resp = await livekitClient.getToken({ scene });
      const newRoom = new Room({
        adaptiveStream: true, dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = newRoom;

      setSessionDisconnectCallback(
        () => { roomRef.current?.disconnect(); },
        () => { roomRef.current?.localParticipant.setMicrophoneEnabled(false); },
      );

      newRoom.localParticipant.registerRpcMethod('executeAction', async (data: any) => {
        try {
          const action: ActionPayload = JSON.parse(data.payload);
          const result = await executeAction(action);
          return JSON.stringify(result);
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      });

      newRoom.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) setConnectionState('connected');
        else if (state === ConnectionState.Disconnected) { setConnectionState('idle'); setRoom(null); }
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        clearSilenceTimer();
        setConnectionState('idle');
        setIsExpanded(false);
        setRoom(null);
        roomRef.current = null;
        onSessionEnd?.();
      });

      newRoom.on(RoomEvent.ActiveSpeakersChanged, () => resetSilenceTimer());
      newRoom.on(RoomEvent.TranscriptionReceived, () => resetSilenceTimer());

      const token = (resp as any).participantToken || (resp as any).token;
      if (!token) throw new Error('No token received');

      await newRoom.connect((resp as any).serverUrl, token);

      try { await newRoom.localParticipant.setMicrophoneEnabled(true); }
      catch (micErr) { console.warn('[LivekitChat] Mic enable failed:', micErr); }

      setRoom(newRoom);
      resetSilenceTimer();
      onSessionStart?.();
    } catch (e: any) {
      console.error('[LivekitChat] Connection error:', e);
      setError(e?.message || 'Connection failed');
      setConnectionState('error');
    }
  }, [connectionState, scene, onSessionStart, onSessionEnd, resetSilenceTimer, clearSilenceTimer]);

  const disconnect = useCallback(async () => {
    clearSilenceTimer();
    if (roomRef.current) { await roomRef.current.disconnect(); roomRef.current = null; }
    setRoom(null);
    setConnectionState('idle');
    setIsExpanded(false);
    onSessionEnd?.();
  }, [onSessionEnd, clearSilenceTimer]);

  useEffect(() => { handleRef({ connect, disconnect }); }, [connect, disconnect, handleRef]);

  useEffect(() => {
    return () => { clearSilenceTimer(); if (roomRef.current) roomRef.current.disconnect(); };
  }, []);

  // --- Render ---
  const isConnected = connectionState === 'connected' && room;

  return h('div', {
    className: 'liquid-glass',
    style: {
      display: 'flex', flexDirection: 'column' as const,
      width: '100%',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      transition: 'all 0.3s ease',
    },
  },

    // ── Header ─────────────────────────────────
    h('div', {
      onClick: () => setIsExpanded(!isExpanded),
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', cursor: 'pointer', userSelect: 'none' as const,
        borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.3)' : 'none',
        transition: 'border-bottom 0.2s',
      },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        // Icon with connection indicator
        h('div', { style: { position: 'relative' } },
          icon('chat_bubble', 18, {
            color: isConnected ? 'var(--primary, #0ea5e9)' : 'var(--text-muted, #6b7280)',
          }),
          isConnected && h('div', {
            style: {
              position: 'absolute', top: '-2px', right: '-2px',
              width: '7px', height: '7px', borderRadius: '50%',
              background: 'var(--primary, #0ea5e9)',
              border: '1.5px solid white',
            },
          }),
        ),
        h('span', {
          style: {
            fontSize: '13px', fontWeight: 600,
            color: 'var(--text-primary, #1f2937)',
          },
        }, '\u8bed\u97f3\u52a9\u624b'),
        h('span', {
          style: {
            fontSize: '11px', fontWeight: 500,
            color: isConnected ? 'var(--primary, #0ea5e9)'
              : connectionState === 'connecting' ? '#f59e0b'
              : 'var(--text-muted, #9ca3af)',
          },
        }, isConnected ? '\u5df2\u8fde\u63a5'
          : connectionState === 'connecting' ? '\u8fde\u63a5\u4e2d...' : '\u672a\u8fde\u63a5'),
      ),
      icon(isExpanded ? 'expand_more' : 'expand_less', 18, { color: 'var(--text-muted, #9ca3af)' }),
    ),

    // ── Expanded Content ──────────────────────────
    isExpanded && (
      isConnected
        // Connected: LiveKit context with hooks
        ? h(RoomContext.Provider, { value: room },
            h(ChatInnerComponent, { room, onDisconnect: disconnect }),
          )
        // Idle / Connecting / Error
        : h('div', {
            style: {
              display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
              justifyContent: 'center', padding: '28px 24px', gap: '4px',
            },
          },
            // Icon
            h('div', {
              style: {
                width: '56px', height: '56px', marginBottom: '8px',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(var(--primary-rgb, 14,165,233), 0.08), rgba(var(--primary-rgb, 14,165,233), 0.18))',
                border: '1px solid rgba(var(--primary-rgb, 14,165,233), 0.12)',
                boxShadow: '0 4px 12px rgba(var(--primary-rgb, 14,165,233), 0.08)',
              },
            },
              connectionState === 'connecting'
                ? icon('sync', 26, {
                    color: 'var(--primary, #0ea5e9)',
                    animation: 'spin 1.5s linear infinite',
                  })
                : icon('graphic_eq', 26, { color: 'var(--primary, #0ea5e9)' }),
            ),
            h('p', {
              style: { fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #4b5563)', margin: 0 },
            }, '\u8bed\u97f3\u52a9\u624b'),
            h('p', {
              style: { fontSize: '12px', color: 'var(--text-muted, #9ca3af)', margin: '0 0 14px' },
            }, '\u70b9\u51fb\u4e0b\u65b9\u6309\u94ae\u5f00\u59cb\u5bf9\u8bdd'),

            // Connect button
            h('button', {
              onClick: connect,
              disabled: connectionState === 'connecting',
              style: {
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 24px', borderRadius: '20px',
                fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
                ...(connectionState === 'connecting'
                  ? {
                      background: 'rgba(var(--primary-rgb, 14,165,233), 0.1)',
                      color: 'var(--primary, #0284c7)',
                    }
                  : {
                      background: 'var(--primary, #0ea5e9)',
                      color: 'white',
                      boxShadow: '0 4px 12px rgba(var(--primary-rgb, 14,165,233), 0.25)',
                    }),
              },
            },
              icon(connectionState === 'connecting' ? 'sync' : 'phone_in_talk', 16, {
                color: 'inherit',
                ...(connectionState === 'connecting' ? { animation: 'spin 1.5s linear infinite' } : {}),
              }),
              connectionState === 'connecting' ? '\u8fde\u63a5\u4e2d...' : '\u5f00\u59cb\u5bf9\u8bdd',
            ),

            // Error message
            error && h('p', {
              style: { fontSize: '11px', color: '#ef4444', marginTop: '10px', textAlign: 'center' as const },
            }, error),
          )
    ),
  );
}

// ---------------------------------------------------------------------------
// Mount function
// ---------------------------------------------------------------------------

export function mountLivekitChat(container: HTMLElement, options: MountOptions): ChatHandle {
  let connectFn: (() => void) | null = null;
  let disconnectFn: (() => void) | null = null;

  const root = ReactDOM.createRoot(container);
  root.render(
    h(LivekitChatPanel, {
      scene: options.scene,
      onSessionStart: options.onSessionStart,
      onSessionEnd: options.onSessionEnd,
      handleRef: (fns: { connect: () => void; disconnect: () => void }) => {
        connectFn = fns.connect;
        disconnectFn = fns.disconnect;
      },
    }),
  );

  return {
    connect: () => connectFn?.(),
    disconnect: () => disconnectFn?.(),
    unmount: () => root.unmount(),
  };
}
