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
 * ChatPanelBridge: SolidJS wrapper that mounts the React-based LiveKit Chat Panel.
 *
 * This bridges the SolidJS page with the React micro-island that uses
 * official @livekit/components-react hooks for proper turn-taking and
 * text interruption.
 */

import { Component, onMount, onCleanup, createEffect, splitProps } from 'solid-js';
import { mountLivekitChat, type ChatHandle, type SceneType } from '@/react/LivekitChat';

interface ChatPanelBridgeProps {
  scene: SceneType;
  /** Reactive trigger: when flipped to true, auto-connect */
  autoStart?: () => boolean;
  /** Called when voice session starts */
  onSessionStart?: () => void;
  /** Called when voice session ends */
  onSessionEnd?: () => void;
}

const ChatPanelBridge: Component<ChatPanelBridgeProps> = (rawProps) => {
  const [props] = splitProps(rawProps, ['scene', 'autoStart', 'onSessionStart', 'onSessionEnd']);

  let container: HTMLDivElement | undefined;
  let handle: ChatHandle | null = null;

  onMount(() => {
    if (!container) return;

    handle = mountLivekitChat(container, {
      scene: props.scene,
      onSessionStart: () => props.onSessionStart?.(),
      onSessionEnd: () => props.onSessionEnd?.(),
    });
  });

  // Watch autoStart trigger from wake word
  createEffect(() => {
    const shouldStart = props.autoStart?.();
    if (shouldStart && handle) {
      console.log('[ChatPanelBridge] Auto-start triggered');
      // Delay to let wake word release mic
      setTimeout(() => handle?.connect(), 500);
    }
  });

  onCleanup(() => {
    handle?.unmount();
    handle = null;
  });

  return (
    <div
      ref={container}
      class="fixed right-4 bottom-4 z-50 w-[380px]"
    />
  );
};

export default ChatPanelBridge;
