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
 * OpenWakeWord Web Implementation
 * Based on dnavarrom/openwakeword_wasm reference implementation
 * 
 * Audio Processing Pipeline:
 * [Audio 1280 samples] -> [Melspectrogram] -> [76 mel frames] -> 
 * [Embedding Model] -> [96-dim vector] -> [Wake Word Model] -> Score
 * 
 * VAD (Voice Activity Detection) confirms speech to reduce false positives.
 */

import * as ort from 'onnxruntime-web';
import { fetchModelWithCache, modelCache } from './modelCache';

// Constants matching reference implementation
const SAMPLE_RATE = 16000;
const FRAME_SIZE = 1280; // 80ms chunks
const MEL_FRAMES_PER_CHUNK = 5; // Each 1280 samples produces 5 mel frames
const MEL_FRAME_SIZE = 32; // 32 mel bins
const MEL_WINDOW_SIZE = 76; // frames needed for one embedding
const MEL_STEP_SIZE = 8; // frames to advance after each embedding
const EMBEDDING_SIZE = 96;
const VAD_HANGOVER_FRAMES = 12;
const DETECTION_THRESHOLD = 0.5;
const COOLDOWN_MS = 2000;

// Available wake words
export type WakeWordType = 'ok_computer' | 'alexa';

export const WAKE_WORD_CONFIG: Record<WakeWordType, { name: string; modelPath: string }> = {
  ok_computer: {
    name: 'Ok Computer',
    modelPath: '/models/ok_computer.onnx',
  },
  alexa: {
    name: 'Alexa',
    modelPath: '/models/alexa_v0.1.onnx',
  },
};

// Model paths (shared models)
const SHARED_MODEL_PATHS = {
  melspectrogram: '/models/melspectrogram.onnx',
  embedding: '/models/embedding_model.onnx',
  vad: '/models/silero_vad.onnx',
};

export type LoadingStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelLoadingState {
  melspectrogram: LoadingStatus;
  embedding: LoadingStatus;
  wakeword: LoadingStatus;
  vad: LoadingStatus;
  overall: LoadingStatus;
  error?: string;
}

export interface WakeWordDetectorConfig {
  onStatusChange?: (status: ModelLoadingState) => void;
  onDetection?: (score: number, wakeWord: WakeWordType) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  detectionThreshold?: number;
  cooldownMs?: number;
  debug?: boolean;
  initialWakeWord?: WakeWordType;
}

// AudioWorklet processor code
const AUDIO_PROCESSOR = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 1280;
    this._buffer = new Float32Array(this.bufferSize);
    this._pos = 0;
  }
  
  process(inputs) {
    const input = inputs[0][0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this._buffer[this._pos++] = input[i];
        if (this._pos === this.bufferSize) {
          this.port.postMessage(this._buffer);
          this._pos = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;

export class WakeWordDetector {
  private melModel: ort.InferenceSession | null = null;
  private embeddingModel: ort.InferenceSession | null = null;
  private wakewordModel: ort.InferenceSession | null = null;
  private vadModel: ort.InferenceSession | null = null;

  // Current wake word
  private currentWakeWord: WakeWordType;

  // Buffers - matching reference implementation
  private melBuffer: Float32Array[] = [];
  private embeddingHistory: Float32Array[] = [];
  private keywordWindowSize = 16; // Will be inferred from model

  // VAD state - matching reference (separate h and c tensors)
  private vadH: ort.Tensor | null = null;
  private vadC: ort.Tensor | null = null;
  private isSpeechActive = false;
  private vadHangover = 0;

  // Detection state
  private isDetectionCoolingDown = false;
  private processingQueue: Promise<void> = Promise.resolve();

  // Configuration
  private config: Required<Pick<WakeWordDetectorConfig, 'detectionThreshold' | 'cooldownMs' | 'debug'>> & WakeWordDetectorConfig;
  private loadingState: ModelLoadingState = {
    melspectrogram: 'idle',
    embedding: 'idle',
    wakeword: 'idle',
    vad: 'idle',
    overall: 'idle',
  };

  // Audio processing state
  private isListening = false;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;

  constructor(config: WakeWordDetectorConfig = {}) {
    this.config = {
      detectionThreshold: config.detectionThreshold ?? DETECTION_THRESHOLD,
      cooldownMs: config.cooldownMs ?? COOLDOWN_MS,
      debug: config.debug ?? false,
      ...config,
    };
    this.currentWakeWord = config.initialWakeWord ?? 'ok_computer';
  }

  private debug(...args: unknown[]) {
    if (this.config.debug) {
      console.debug('[WakeWord]', ...args);
    }
  }

  private updateLoadingState(updates: Partial<ModelLoadingState>) {
    this.loadingState = { ...this.loadingState, ...updates };
    
    const statuses = [
      this.loadingState.melspectrogram,
      this.loadingState.embedding,
      this.loadingState.wakeword,
      this.loadingState.vad,
    ];
    
    if (statuses.some(s => s === 'error')) {
      this.loadingState.overall = 'error';
    } else if (statuses.every(s => s === 'ready')) {
      this.loadingState.overall = 'ready';
    } else if (statuses.some(s => s === 'loading')) {
      this.loadingState.overall = 'loading';
    } else {
      this.loadingState.overall = 'idle';
    }
    
    this.config.onStatusChange?.(this.loadingState);
  }

  /**
   * Initialize ONNX Runtime and load all models
   */
  async initialize(): Promise<void> {
    try {
      // Configure ONNX Runtime
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      this.updateLoadingState({ overall: 'loading' });

      // Load models in parallel
      await Promise.all([
        this.loadSharedModel('melspectrogram'),
        this.loadSharedModel('embedding'),
        this.loadSharedModel('vad'),
        this.loadWakeWordModel(this.currentWakeWord),
      ]);

      // Initialize state
      this.resetState();

      console.log('[WakeWord] All models loaded successfully');
      console.log(`[WakeWord] Current wake word: ${WAKE_WORD_CONFIG[this.currentWakeWord].name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateLoadingState({ 
        overall: 'error', 
        error: errorMessage 
      });
      throw error;
    }
  }

  private async loadSharedModel(modelName: 'melspectrogram' | 'embedding' | 'vad'): Promise<void> {
    this.updateLoadingState({ [modelName]: 'loading' } as Partial<ModelLoadingState>);
    
    try {
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      };

      const modelPath = SHARED_MODEL_PATHS[modelName];
      const modelData = await fetchModelWithCache(modelPath);
      const session = await ort.InferenceSession.create(modelData, sessionOptions);
      
      this.debug(`Model ${modelName} loaded:`, {
        inputs: session.inputNames,
        outputs: session.outputNames,
      });
      
      switch (modelName) {
        case 'melspectrogram':
          this.melModel = session;
          break;
        case 'embedding':
          this.embeddingModel = session;
          break;
        case 'vad':
          this.vadModel = session;
          break;
      }

      this.updateLoadingState({ [modelName]: 'ready' } as Partial<ModelLoadingState>);
      console.log(`[WakeWord] Model ${modelName} loaded`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load model';
      this.updateLoadingState({ 
        [modelName]: 'error',
        error: `${modelName}: ${errorMessage}`,
      } as Partial<ModelLoadingState>);
      throw error;
    }
  }

  private async loadWakeWordModel(wakeWord: WakeWordType): Promise<void> {
    this.updateLoadingState({ wakeword: 'loading' });
    
    try {
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      };

      const modelPath = WAKE_WORD_CONFIG[wakeWord].modelPath;
      const modelData = await fetchModelWithCache(modelPath);
      const session = await ort.InferenceSession.create(modelData, sessionOptions);
      
      this.debug(`Wake word model ${wakeWord} loaded:`, {
        inputs: session.inputNames,
        outputs: session.outputNames,
      });
      
      this.wakewordModel = session;
      this.keywordWindowSize = 16; // Default window size

      this.updateLoadingState({ wakeword: 'ready' });
      console.log(`[WakeWord] Wake word model loaded: ${WAKE_WORD_CONFIG[wakeWord].name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load model';
      this.updateLoadingState({ 
        wakeword: 'error',
        error: `wakeword: ${errorMessage}`,
      });
      throw error;
    }
  }

  /**
   * Switch to a different wake word
   */
  async switchWakeWord(wakeWord: WakeWordType): Promise<void> {
    if (wakeWord === this.currentWakeWord) return;

    const wasListening = this.isListening;
    
    // Stop listening during model switch
    if (wasListening) {
      await this.stopListening();
    }

    console.log(`[WakeWord] Switching wake word from ${this.currentWakeWord} to ${wakeWord}`);
    this.currentWakeWord = wakeWord;

    // Load new wake word model
    await this.loadWakeWordModel(wakeWord);
    
    // Reset state for new model
    this.resetState();

    // Resume listening if was previously listening
    if (wasListening) {
      await this.startListening();
    }
  }

  /**
   * Get current wake word
   */
  getCurrentWakeWord(): WakeWordType {
    return this.currentWakeWord;
  }

  /**
   * Get available wake words
   */
  static getAvailableWakeWords(): Array<{ id: WakeWordType; name: string }> {
    return Object.entries(WAKE_WORD_CONFIG).map(([id, config]) => ({
      id: id as WakeWordType,
      name: config.name,
    }));
  }

  private resetState(): void {
    this.melBuffer = [];
    
    // Initialize embedding history with zeros
    this.embeddingHistory = [];
    for (let i = 0; i < this.keywordWindowSize; i++) {
      this.embeddingHistory.push(new Float32Array(EMBEDDING_SIZE).fill(0));
    }
    
    // Initialize VAD state tensors (h and c)
    const vadShape: [number, number, number] = [2, 1, 64];
    this.vadH = new ort.Tensor('float32', new Float32Array(128).fill(0), vadShape);
    this.vadC = new ort.Tensor('float32', new Float32Array(128).fill(0), vadShape);
    
    this.isSpeechActive = false;
    this.vadHangover = 0;
    this.isDetectionCoolingDown = false;
    
    this.debug('State reset');
  }

  /**
   * Run VAD on audio chunk
   */
  private async runVAD(chunk: Float32Array): Promise<boolean> {
    if (!this.vadModel || !this.vadH || !this.vadC) return false;

    try {
      const tensor = new ort.Tensor('float32', chunk, [1, chunk.length]);
      const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);
      
      const result = await this.vadModel.run({
        input: tensor,
        sr: sr,
        h: this.vadH,
        c: this.vadC,
      });
      
      // Update VAD state for next iteration
      this.vadH = result.hn as ort.Tensor;
      this.vadC = result.cn as ort.Tensor;
      
      const confidence = (result.output.data as Float32Array)[0];
      this.debug('VAD confidence:', confidence.toFixed(3));
      
      return confidence > 0.5;
    } catch (err) {
      console.error('[WakeWord] VAD error:', err);
      return false;
    }
  }

  /**
   * Process audio chunk through the full pipeline
   */
  private async processChunk(chunk: Float32Array): Promise<void> {
    if (!this.melModel || !this.embeddingModel || !this.wakewordModel) return;

    // Debug audio levels
    if (this.config.debug) {
      let peak = 0;
      for (let i = 0; i < chunk.length; i++) {
        const abs = Math.abs(chunk[i]);
        if (abs > peak) peak = abs;
      }
      this.debug('Audio peak:', peak.toFixed(4));
    }

    // Run VAD
    const vadTriggered = await this.runVAD(chunk);
    
    if (vadTriggered) {
      if (!this.isSpeechActive) {
        this.config.onSpeechStart?.();
      }
      this.isSpeechActive = true;
      this.vadHangover = VAD_HANGOVER_FRAMES;
    } else if (this.isSpeechActive) {
      this.vadHangover -= 1;
      if (this.vadHangover <= 0) {
        this.isSpeechActive = false;
        this.config.onSpeechEnd?.();
      }
    }

    // Run mel spectrogram
    const melTensor = new ort.Tensor('float32', chunk, [1, FRAME_SIZE]);
    const melResult = await this.melModel.run({ 
      [this.melModel.inputNames[0]]: melTensor 
    });
    const melData = melResult[this.melModel.outputNames[0]].data as Float32Array;

    // Apply transformation: output = (value / 10.0) + 2.0
    for (let j = 0; j < melData.length; j++) {
      melData[j] = melData[j] / 10.0 + 2.0;
    }
    
    // Split into 5 frames of 32 mel bins each
    for (let j = 0; j < MEL_FRAMES_PER_CHUNK; j++) {
      this.melBuffer.push(new Float32Array(melData.subarray(j * MEL_FRAME_SIZE, (j + 1) * MEL_FRAME_SIZE)));
    }

    // Process when we have enough mel frames
    while (this.melBuffer.length >= MEL_WINDOW_SIZE) {
      const windowFrames = this.melBuffer.slice(0, MEL_WINDOW_SIZE);
      
      // Flatten for embedding model [1, 76, 32, 1]
      const flattenedMel = new Float32Array(MEL_WINDOW_SIZE * MEL_FRAME_SIZE);
      for (let j = 0; j < windowFrames.length; j++) {
        flattenedMel.set(windowFrames[j], j * MEL_FRAME_SIZE);
      }

      // Run embedding model
      const embeddingTensor = new ort.Tensor('float32', flattenedMel, [1, MEL_WINDOW_SIZE, MEL_FRAME_SIZE, 1]);
      const embeddingResult = await this.embeddingModel.run({
        [this.embeddingModel.inputNames[0]]: embeddingTensor
      });
      const newEmbedding = new Float32Array(embeddingResult[this.embeddingModel.outputNames[0]].data as Float32Array);

      // Update embedding history (sliding window)
      this.embeddingHistory.shift();
      this.embeddingHistory.push(newEmbedding);

      // Run wake word detection
      const flattenedEmbeddings = new Float32Array(this.keywordWindowSize * EMBEDDING_SIZE);
      for (let j = 0; j < this.embeddingHistory.length; j++) {
        flattenedEmbeddings.set(this.embeddingHistory[j], j * EMBEDDING_SIZE);
      }
      
      const wakewordTensor = new ort.Tensor('float32', flattenedEmbeddings, [1, this.keywordWindowSize, EMBEDDING_SIZE]);
      const wakewordResult = await this.wakewordModel.run({
        [this.wakewordModel.inputNames[0]]: wakewordTensor
      });
      
      const score = (wakewordResult[this.wakewordModel.outputNames[0]].data as Float32Array)[0];
      this.debug('Wake word score:', score.toFixed(3), 'Speech active:', this.isSpeechActive);

      // Detection logic
      if (
        score > this.config.detectionThreshold && 
        this.isSpeechActive && 
        !this.isDetectionCoolingDown
      ) {
        this.isDetectionCoolingDown = true;
        console.log(`[WakeWord] "${WAKE_WORD_CONFIG[this.currentWakeWord].name}" detected! Score: ${score.toFixed(3)}`);
        this.config.onDetection?.(score, this.currentWakeWord);
        
        setTimeout(() => {
          this.isDetectionCoolingDown = false;
        }, this.config.cooldownMs);
      }

      // Slide mel buffer
      this.melBuffer.splice(0, MEL_STEP_SIZE);
    }
  }

  /**
   * Start listening for wake word
   */
  async startListening(): Promise<void> {
    if (this.loadingState.overall !== 'ready') {
      throw new Error('Models not loaded. Call initialize() first.');
    }

    if (this.isListening) return;

    try {
      this.resetState();

      // Request microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create gain node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Create audio worklet
      const blob = new Blob([AUDIO_PROCESSOR], { type: 'application/javascript' });
      const workletURL = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(workletURL);
      
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      
      this.workletNode.port.onmessage = (event) => {
        const chunk = event.data as Float32Array;
        if (!chunk) return;
        
        // Queue processing to avoid blocking
        this.processingQueue = this.processingQueue
          .then(() => this.processChunk(chunk))
          .catch((err) => console.error('[WakeWord] Processing error:', err));
      };

      // Connect audio graph (DO NOT connect to destination - that would play audio through speakers)
      source.connect(this.gainNode);
      this.gainNode.connect(this.workletNode);
      // Note: We intentionally don't connect to audioContext.destination to avoid echo

      this.isListening = true;
      console.log(`[WakeWord] Started listening for "${WAKE_WORD_CONFIG[this.currentWakeWord].name}"`);
    } catch (error) {
      console.error('[WakeWord] Failed to start listening:', error);
      throw error;
    }
  }

  /**
   * Stop listening for wake word
   */
  async stopListening(): Promise<void> {
    this.isListening = false;

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.isDetectionCoolingDown = false;
    console.log('[WakeWord] Stopped listening');
  }

  /**
   * Set gain value
   */
  setGain(value: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  /**
   * Get current listening state
   */
  getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Get current loading state
   */
  getLoadingState(): ModelLoadingState {
    return this.loadingState;
  }

  /**
   * Clear model cache (force re-download on next load)
   */
  static async clearCache(): Promise<void> {
    await modelCache.clear();
    console.log('[WakeWord] Model cache cleared');
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopListening();
    this.melModel = null;
    this.embeddingModel = null;
    this.wakewordModel = null;
    this.vadModel = null;
  }
}

// Singleton instance for easy access
let detectorInstance: WakeWordDetector | null = null;

export function getWakeWordDetector(config?: WakeWordDetectorConfig): WakeWordDetector {
  if (!detectorInstance) {
    detectorInstance = new WakeWordDetector(config);
  }
  return detectorInstance;
}

export function resetWakeWordDetector(): void {
  if (detectorInstance) {
    detectorInstance.dispose();
    detectorInstance = null;
  }
}
