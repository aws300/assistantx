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
 * React-based LiveKit Chat Panel (micro-island)
 *
 * Uses React.createElement (no JSX) to avoid conflicts with SolidJS JSX transform.
 * Leverages official @livekit/components-react hooks for proper turn-taking,
 * audio management, and text chat interruption.
 *
 * Styling: Tailwind CSS classes (scanned by Tailwind v4 from .ts files).
 * Icons: Material Symbols Outlined via className.
 * Animations: LiveKit BarVisualizer + custom CSS keyframes.
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
import {
  KrispNoiseFilter,
  isKrispNoiseFilterSupported,
} from '@livekit/krisp-noise-filter';
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
// Material Icon helper (Tailwind className based)
// ---------------------------------------------------------------------------

function micon(name: string, cls = '') {
  return h('span', { className: `material-symbols-outlined select-none leading-none ${cls}`.trim() }, name);
}

// ---------------------------------------------------------------------------
// Inject panel-specific keyframe CSS
// ---------------------------------------------------------------------------

const PANEL_CSS = `
@keyframes lk-chat-pulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.8);opacity:0}}
@keyframes lk-chat-dots{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
@keyframes lk-chat-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes lk-spin{to{transform:rotate(360deg)}}
.lk-chat-msgs::-webkit-scrollbar{width:4px}
.lk-chat-msgs::-webkit-scrollbar-track{background:transparent}
.lk-chat-msgs::-webkit-scrollbar-thumb{background:rgba(0,0,0,.08);border-radius:4px}
.lk-msg-in{animation:lk-chat-fade .25s ease-out}
.lk-spin{animation:lk-spin 1.2s linear infinite}
.lk-dot{animation:lk-chat-dots 1.2s ease-in-out infinite}
.lk-pulse{animation:lk-chat-pulse 2s ease-in-out infinite}
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = PANEL_CSS;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

function toMsg(
  t: { text: string; streamInfo: { id: string; timestamp: number }; participantInfo: { identity: string } },
  room: Room,
): Msg {
  return {
    id: t.streamInfo.id,
    role: t.participantInfo.identity === room.localParticipant.identity ? 'user' : 'assistant',
    content: t.text,
    timestamp: t.streamInfo.timestamp,
  };
}

// ---------------------------------------------------------------------------
// AgentStatusBar
// ---------------------------------------------------------------------------

function AgentStatusBar({ state, audioTrack }: { state: string; audioTrack?: any }) {
  if (!state || state === 'idle' || state === 'disconnected') return null;

  const labels: Record<string, string> = {
    listening: '\u6b63\u5728\u8046\u542c',
    thinking: '\u601d\u8003\u4e2d',
    speaking: '\u56de\u590d\u4e2d',
    connecting: '\u8fde\u63a5\u4e2d',
    initializing: '\u521d\u59cb\u5316',
  };

  // Speaking: BarVisualizer
  if (state === 'speaking' && audioTrack) {
    return h('div', { className: 'flex items-center justify-center gap-3 py-2.5 px-4 bg-primary/5 border-b border-primary/10' },
      h('div', {
        className: 'flex items-center h-7',
        style: { '--lk-va-bar-width': '4px', '--lk-va-bar-gap': '3px', '--lk-fg': 'var(--primary, #3b82f6)' } as any,
      },
        h(BarVisualizer, { state: 'speaking' as any, trackRef: audioTrack, barCount: 7, options: { minHeight: 3 }, style: { height: '100%' } }),
      ),
      h('span', { className: 'text-xs font-medium text-primary' }, labels[state]),
    );
  }

  // Thinking: bouncing dots
  if (state === 'thinking') {
    return h('div', { className: 'flex items-center justify-center gap-2.5 py-2 px-4 bg-amber-50 border-b border-amber-100' },
      h('div', { className: 'flex gap-1 items-center' },
        ...[0, 1, 2].map(i =>
          h('div', { key: i, className: 'w-1.5 h-1.5 rounded-full bg-amber-500 lk-dot', style: { animationDelay: `${i * 0.15}s` } }),
        ),
      ),
      h('span', { className: 'text-xs font-medium text-amber-600' }, labels[state]),
    );
  }

  // Listening: pulsing ring
  return h('div', { className: 'flex items-center justify-center gap-2.5 py-2 px-4 bg-primary/5 border-b border-primary/10' },
    h('div', { className: 'relative w-2.5 h-2.5' },
      h('div', { className: 'absolute inset-0 rounded-full bg-primary lk-pulse' }),
      h('div', { className: 'absolute inset-0.5 rounded-full bg-primary' }),
    ),
    h('span', { className: 'text-xs font-medium text-primary' }, labels[state] || state),
  );
}

// ---------------------------------------------------------------------------
// ChatInner (inside RoomContext)
// ---------------------------------------------------------------------------

function ChatInner({ room, onDisconnect }: { room: Room; onDisconnect: () => void }) {
  const [inputText, setInputText] = useState('');
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const chat = useChat();

  useEffect(() => {
    if (!isMicrophoneEnabled) localParticipant.setMicrophoneEnabled(true).catch(console.warn);
  }, []);

  // Merge + dedupe messages
  const msgs: Msg[] = useMemo(() => {
    const all: Msg[] = [];
    for (const t of transcriptions) all.push(toMsg(t, room));
    for (const m of chat.chatMessages) {
      all.push({ id: m.id ?? `c-${m.timestamp}`, role: m.from?.isLocal ? 'user' : 'assistant', content: m.message, timestamp: m.timestamp });
    }
    const seen = new Set<string>();
    return all.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; }).sort((a, b) => a.timestamp - b.timestamp);
  }, [transcriptions, chat.chatMessages, room]);

  useEffect(() => {
    const t = setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [msgs]);


  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    try { await chat.send(text); } catch (e) { console.error('[LivekitChat] Send failed:', e); }
    inputRef.current?.focus();
  }, [inputText, chat]);


  const toggleMic = useCallback(async () => {
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); } catch {}
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleSpeaker = useCallback(async () => {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    document.querySelectorAll('audio').forEach(el => { (el as HTMLAudioElement).volume = next ? 0 : 1; });
    try {
      const agent = Array.from(room.remoteParticipants.values()).find((p: RemoteParticipant) => p.identity.includes('agent'));
      if (agent) await room.localParticipant.performRpc({ destinationIdentity: agent.identity, method: 'setAudioOutput', payload: JSON.stringify({ enabled: !next }) });
    } catch {}
  }, [room, speakerMuted]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  return h(React.Fragment, null,
    h(RoomAudioRenderer, null),
    h(AgentStatusBar, { state: agentState, audioTrack: agentAudioTrack }),

    // Messages
    h('div', { className: 'lk-chat-msgs flex-1 overflow-y-auto px-4 py-3 max-h-72 min-h-28 space-y-2' },
      msgs.length === 0
        ? h('div', { className: 'flex flex-col items-center justify-center py-6 gap-2' },
            h('div', { className: 'w-13 h-13 rounded-full flex items-center justify-center bg-primary/10 border border-primary/10' },
              micon('graphic_eq', 'text-[26px] text-primary'),
            ),
            h('p', { className: 'font-medium text-sm text-text-primary' }, '\u5f00\u59cb\u5bf9\u8bdd'),
            h('p', { className: 'text-xs text-text-muted' }, '\u8bf4\u8bdd\u6216\u8f93\u5165\u6587\u5b57'),
          )
        : h(React.Fragment, null,
            ...msgs.map(m =>
              h('div', { key: m.id, className: `lk-msg-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}` },
                h('div', {
                  className: [
                    'max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed',
                    m.role === 'user'
                      ? 'glass-bubble-user rounded-br-md text-text-primary'
                      : 'glass-bubble-agent rounded-bl-md text-text-primary',
                  ].join(' '),
                },
                  h('p', { className: 'whitespace-pre-wrap m-0' }, m.content),
                ),
              ),
            ),
            // Speaking bubble with BarVisualizer
            agentState === 'speaking' && agentAudioTrack && h('div', { className: 'lk-msg-in flex justify-start' },
              h('div', { className: 'glass-bubble-agent rounded-2xl rounded-bl-md flex items-center gap-2 px-4 py-2.5' },
                h('div', {
                  className: 'flex items-center h-5',
                  style: { '--lk-va-bar-width': '3px', '--lk-va-bar-gap': '2px', '--lk-fg': 'var(--primary, #3b82f6)' } as any,
                },
                  h(BarVisualizer, { state: 'speaking' as any, trackRef: agentAudioTrack, barCount: 5, options: { minHeight: 3 }, style: { height: '100%' } }),
                ),
                h('span', { className: 'text-xs text-text-muted' }, '\u6b63\u5728\u8bf4\u8bdd...'),
              ),
            ),
            h('div', { ref: endRef }),
          ),
    ),

    // Input area
    h('div', { className: 'p-2.5 border-t border-white/40 bg-white/25' },
      h('div', { className: 'flex items-center gap-1.5' },
        // Mic
        h('button', {
          onClick: toggleMic,
          title: isMicrophoneEnabled ? '\u9759\u97f3' : '\u5f00\u9ea6',
          className: [
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-none cursor-pointer transition-all duration-200',
            isMicrophoneEnabled ? 'bg-primary text-white shadow-primary/20 shadow-md' : 'bg-black/5 text-text-muted',
          ].join(' '),
        }, micon(isMicrophoneEnabled ? 'mic' : 'mic_off', 'text-[18px]')),

        // Input
        h('div', { className: 'glass-input flex-1 flex items-center rounded-full overflow-hidden' },
          h('input', {
            ref: inputRef, type: 'text', value: inputText,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputText(e.target.value),
            onKeyDown: onKey,
            placeholder: agentState === 'listening' ? '\u6b63\u5728\u8046\u542c...' : agentState === 'speaking' ? '\u52a9\u624b\u56de\u590d\u4e2d...' : '\u8f93\u5165\u6d88\u606f...',
            disabled: chat.isSending,
            className: 'input-inner flex-1 px-3.5 py-1.5 text-[13px] text-text-primary font-[inherit]',
          }),
        ),

        // Send
        h('button', {
          onClick: handleSend, disabled: !inputText.trim() || chat.isSending, title: '\u53d1\u9001',
          className: [
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-none transition-all duration-200',
            inputText.trim() ? 'bg-primary text-white shadow-primary/20 shadow-md cursor-pointer' : 'bg-black/5 text-black/20 cursor-default',
          ].join(' '),
        }, micon('send', 'text-[18px]')),

        // Speaker
        h('button', {
          onClick: toggleSpeaker,
          title: speakerMuted ? '\u5f00\u542f\u8bed\u97f3' : '\u9759\u97f3',
          className: [
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border cursor-pointer transition-all duration-200',
            speakerMuted ? 'bg-amber-50 text-amber-600 border-amber-200/50' : 'bg-white/50 text-text-muted border-black/5',
          ].join(' '),
        }, micon(speakerMuted ? 'volume_off' : 'volume_up', 'text-[18px]')),
      ),

      // Status row
      h('div', { className: 'flex items-center justify-between mt-2 px-0.5' },
        h('div', { className: 'flex items-center gap-1.5' },
          h('div', {
            className: [
              'w-1.5 h-1.5 rounded-full',
              agentState === 'speaking' ? 'bg-primary' : agentState === 'thinking' ? 'bg-amber-500' : agentState === 'listening' ? 'bg-primary' : 'bg-gray-400',
            ].join(' '),
          }),
          h('span', { className: 'text-[11px] text-text-muted' }, speakerMuted ? '\u6587\u5b57\u6a21\u5f0f' : '\u8bed\u97f3\u6a21\u5f0f'),
        ),
        h('button', {
          onClick: onDisconnect,
          className: 'flex items-center gap-1 text-[11px] text-red-500 bg-transparent border-none cursor-pointer px-2 py-1 rounded-lg hover:bg-red-500/5 transition-colors',
        },
          micon('call_end', 'text-[14px] text-red-500'),
          '\u65ad\u5f00\u8fde\u63a5',
        ),
      ),
    ),
  );
}

const ChatInnerMemo = React.memo(ChatInner);

// ---------------------------------------------------------------------------
// LivekitChatPanel
// ---------------------------------------------------------------------------

const SILENCE_MS = 5 * 60 * 1000;

interface PanelProps {
  scene: SceneType;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  handleRef: (fns: { connect: () => void; disconnect: () => void }) => void;
}

function LivekitChatPanel({ scene, onSessionStart, onSessionEnd, handleRef }: PanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [connState, setConnState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { injectCSS(); }, []);

  const resetSilence = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => { roomRef.current?.disconnect(); }, SILENCE_MS);
  }, []);

  const clearSilence = useCallback(() => {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
  }, []);

  const connect = useCallback(async () => {
    if (connState === 'connecting' || connState === 'connected') return;
    setConnState('connecting');
    setExpanded(true);
    setError(null);
    onSessionStart?.();

    try {
      const resp = await livekitClient.getToken({ scene });
      const r = new Room({
        adaptiveStream: true, dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      });
      roomRef.current = r;

      setSessionDisconnectCallback(
        () => { roomRef.current?.disconnect(); },
        () => { roomRef.current?.localParticipant.setMicrophoneEnabled(false); },
      );

      r.registerRpcMethod('executeAction', async (data: any) => {
        try {
          const action: ActionPayload = JSON.parse(data.payload);
          return JSON.stringify(await executeAction(action));
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      });

      // Only handle Disconnected here — Connected is set AFTER setRoom below
      r.on(RoomEvent.Disconnected, () => {
        clearSilence();
        setConnState('idle');
        setExpanded(false);
        setRoom(null);
        roomRef.current = null;
        onSessionEnd?.();
      });

      r.on(RoomEvent.ActiveSpeakersChanged, () => resetSilence());
      r.on(RoomEvent.TranscriptionReceived, () => resetSilence());

      const token = (resp as any).participantToken || (resp as any).token;
      if (!token) throw new Error('No token received');

      // Pass empty iceServers so livekit-client does NOT use the server's JoinResponse
      // ICE servers, which may contain invalid URLs (stun:host:port/path) that browsers
      // reject with "ICE server parsing failed: Invalid port".
      // The TCP ICE candidate from LiveKit's node_ip still works via signaling.
      await r.connect((resp as any).serverUrl, token, {
        rtcConfig: { iceServers: [] },
      });

      try { await r.localParticipant.setMicrophoneEnabled(true); }
      catch (e) { console.warn('[LivekitChat] Mic enable failed:', e); }

      // Apply Krisp AI noise filter to microphone track
      try {
        const getMicTrack = () => {
          const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
          return pub?.track ?? null;
        };
        let micTrack = getMicTrack();
        // Track may not be published yet — poll briefly
        if (!micTrack) {
          await new Promise(res => setTimeout(res, 500));
          micTrack = getMicTrack();
        }
        if (micTrack) {
          if (isKrispNoiseFilterSupported()) {
            const krisp = KrispNoiseFilter();
            await micTrack.setProcessor(krisp as any);
            console.info('[LivekitChat] Krisp noise filter enabled');
          } else {
            console.info('[LivekitChat] Krisp not supported, using native noiseSuppression fallback');
            await micTrack.restartTrack({ noiseSuppression: true });
          }
        } else {
          console.warn('[LivekitChat] Mic track not available for Krisp');
        }
      } catch (e) { console.warn('[LivekitChat] Krisp init failed, falling back to native:', e); }

      // Set room AND connected state together to prevent flash
      setRoom(r);
      setConnState('connected');
      resetSilence();
      onSessionStart?.();
    } catch (e: any) {
      console.error('[LivekitChat] Connection error:', e);
      setError(e?.message || 'Connection failed');
      setConnState('error');
    }
  }, [connState, scene, onSessionStart, onSessionEnd, resetSilence, clearSilence]);

  const disconnect = useCallback(async () => {
    clearSilence();
    if (roomRef.current) { await roomRef.current.disconnect(); roomRef.current = null; }
    setRoom(null);
    setConnState('idle');
    setExpanded(false);
    onSessionEnd?.();
  }, [onSessionEnd, clearSilence]);

  useEffect(() => { handleRef({ connect, disconnect }); }, [connect, disconnect, handleRef]);
  useEffect(() => () => { clearSilence(); if (roomRef.current) roomRef.current.disconnect(); }, []);

  const isConnected = connState === 'connected' && room;

  return h('div', { className: 'liquid-glass flex flex-col w-full rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.08)] font-display transition-all duration-300' },

    // Header
    h('div', {
      onClick: () => setExpanded(!expanded),
      className: `flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none transition-all ${expanded ? 'border-b border-white/30' : ''}`,
    },
      h('div', { className: 'flex items-center gap-2.5' },
        h('div', { className: 'relative h-[18px]' },
          micon('chat_bubble', `text-[18px] ${isConnected ? 'text-primary' : 'text-text-muted'}`),
          isConnected && h('div', { className: 'absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-primary border-[1.5px] border-white' }),
        ),
        h('span', { className: 'text-[13px] font-semibold text-text-primary' }, '\u8bed\u97f3\u52a9\u624b'),
        h('span', {
          className: `text-[11px] font-medium ${isConnected ? 'text-primary' : connState === 'connecting' ? 'text-amber-500' : 'text-text-muted'}`,
        }, isConnected ? '\u5df2\u8fde\u63a5' : connState === 'connecting' ? '\u8fde\u63a5\u4e2d...' : '\u672a\u8fde\u63a5'),
      ),
      micon(expanded ? 'expand_more' : 'expand_less', 'text-[18px] text-text-muted'),
    ),

    // Content
    expanded && (
      isConnected
        ? h(RoomContext.Provider, { value: room }, h(ChatInnerMemo, { room, onDisconnect: disconnect }))
        : h('div', { className: 'flex flex-col items-center justify-center py-7 px-6 gap-1' },
            h('div', { className: 'w-14 h-14 mb-2 rounded-full flex items-center justify-center bg-primary/10 border border-primary/10 shadow-sm' },
              micon(connState === 'connecting' ? 'sync' : 'graphic_eq',
                `text-[26px] text-primary ${connState === 'connecting' ? 'lk-spin' : ''}`),
            ),
            h('p', { className: 'font-semibold text-sm text-text-primary m-0' }, '\u8bed\u97f3\u52a9\u624b'),
            h('p', { className: 'text-xs text-text-muted m-0 mb-3.5' }, '\u70b9\u51fb\u4e0b\u65b9\u6309\u94ae\u5f00\u59cb\u5bf9\u8bdd'),
            h('button', {
              onClick: connect,
              disabled: connState === 'connecting',
              className: [
                'flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-semibold border-none cursor-pointer transition-all duration-200',
                connState === 'connecting'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-primary text-white shadow-primary/20 shadow-lg hover:brightness-110',
              ].join(' '),
            },
              micon(connState === 'connecting' ? 'sync' : 'phone_in_talk',
                `text-[16px] ${connState === 'connecting' ? 'lk-spin' : ''}`),
              connState === 'connecting' ? '\u8fde\u63a5\u4e2d...' : '\u5f00\u59cb\u5bf9\u8bdd',
            ),
            error && h('p', { className: 'text-[11px] text-red-500 mt-2.5 text-center' }, error),
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
