import type { StreamChunk } from '@responsivevoice/types';
import MSEAudioWrapper from 'mse-audio-wrapper';
import type { IAudioElement } from './pool';

/** Compat shim: ManagedMediaSource (iOS Safari 17.1+) or standard MediaSource */
type MediaSourceCompat = MediaSource;

function getMediaSourceConstructor(): (new () => MediaSourceCompat) | undefined {
  if (typeof window === 'undefined') return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: ManagedMediaSource is not in lib.dom
  return (window as any).ManagedMediaSource ?? window.MediaSource;
}

/**
 * Check if the browser's MediaSource supports a given MIME type natively.
 * E.g. Chrome supports `audio/mpeg` directly, so no wrapper needed.
 */
function isTypeSupported(mimeType: string): boolean {
  const MS = getMediaSourceConstructor();
  if (!MS) return false;
  // biome-ignore lint/suspicious/noExplicitAny: isTypeSupported is static on both MediaSource and ManagedMediaSource
  return (MS as any).isTypeSupported?.(mimeType) ?? false;
}

interface MediaSourcePlayerCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Progressive audio player using MediaSource Extensions.
 * Feeds streaming TTS audio chunks into a SourceBuffer, starting playback
 * as soon as the first segment is buffered rather than waiting for full download.
 *
 * Two modes:
 * - **Raw mode**: Browser natively supports the content type (e.g. Chrome + `audio/mpeg`).
 *   Raw audio bytes go directly into the SourceBuffer — no wrapping needed.
 * - **Wrapper mode**: Browser doesn't support the raw type (e.g. Firefox + `audio/mpeg`).
 *   Uses mse-audio-wrapper to repackage into fMP4 (`audio/mp4;codecs="mp3"`).
 *
 * Tier 1: Standard MediaSource (Chrome, Firefox, Edge, Safari desktop)
 * Tier 2: ManagedMediaSource (iOS Safari 17.1+)
 */
export class MediaSourcePlayer {
  private mediaSource: MediaSourceCompat | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audio: IAudioElement | null = null;
  private wrapper: InstanceType<typeof MSEAudioWrapper> | null = null;
  private useRawMode = false;
  private objectUrl: string | null = null;
  private playbackStarted = false;
  private streamEnded = false;
  private pendingBuffers: Uint8Array[] = [];
  private isAppending = false;
  private callbacks: MediaSourcePlayerCallbacks = {};
  private aborted = false;

  static isSupported(): boolean {
    return getMediaSourceConstructor() !== undefined;
  }

  /**
   * Play audio progressively from a streaming source.
   *
   * @param audio - Audio element from the pool
   * @param stream - AsyncGenerator yielding StreamChunk from synthesizeStream()
   * @param callbacks - onStart/onEnd/onError callbacks
   * @param volume - Playback volume (0-1)
   * @param rate - Playback rate multiplier
   */
  async play(
    audio: IAudioElement,
    stream: AsyncGenerator<StreamChunk>,
    callbacks: MediaSourcePlayerCallbacks,
    volume = 1,
    rate = 1
  ): Promise<void> {
    this.audio = audio;
    this.callbacks = callbacks;
    this.aborted = false;

    const MSConstructor = getMediaSourceConstructor();
    if (!MSConstructor) {
      throw new Error('MediaSource API is not available');
    }

    this.mediaSource = new MSConstructor();

    return new Promise<void>((resolve, reject) => {
      const ms = this.mediaSource!;

      const onSourceOpen = () => {
        ms.removeEventListener('sourceopen', onSourceOpen);
        this.consumeStream(stream, volume, rate, resolve, reject);
      };

      ms.addEventListener('sourceopen', onSourceOpen);

      // Attach MediaSource to audio element
      this.objectUrl = URL.createObjectURL(ms as MediaSource);
      audio.src = this.objectUrl;
      audio.volume = volume;
    });
  }

  /**
   * Abort the streaming playback and clean up resources.
   */
  abort(): void {
    this.aborted = true;
    this.cleanup();
  }

  /**
   * Get the object URL for cleanup purposes.
   */
  getObjectUrl(): string | null {
    return this.objectUrl;
  }

  private initSourceBuffer(mimeType: string): void {
    this.sourceBuffer = this.mediaSource!.addSourceBuffer(mimeType);
    this.sourceBuffer.addEventListener('updateend', () => {
      this.flushPendingBuffers();
    });
  }

  private initMetadataMode(contentType: string, reject: (error: Error) => void): void {
    if (isTypeSupported(contentType)) {
      this.useRawMode = true;
      this.initSourceBuffer(contentType);
    } else {
      this.useRawMode = false;
      this.wrapper = new MSEAudioWrapper(contentType, {
        preferredContainer: 'fmp4',
        minFramesPerSegment: 2,
        minBytesPerSegment: 512,
        onMimeType: (wrappedMimeType: string) => {
          if (this.sourceBuffer || this.aborted) return;
          try {
            this.initSourceBuffer(wrappedMimeType);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.callbacks.onError?.(error);
            reject(error);
          }
        },
      });
    }
  }

  private appendAudioChunk(data: Uint8Array): void {
    if (this.useRawMode) {
      this.appendBuffer(data);
    } else if (this.wrapper) {
      for (const segment of this.wrapper.iterator(data)) {
        this.appendBuffer(segment);
      }
    }
  }

  private toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
  }

  private failWithError(error: Error, reject: (error: Error) => void): void {
    this.callbacks.onError?.(error);
    reject(error);
  }

  private handleStreamChunk(
    chunk: StreamChunk,
    volume: number,
    rate: number,
    resolve: () => void,
    reject: (error: Error) => void
  ): boolean {
    if (chunk.type === 'metadata') {
      this.initMetadataMode(chunk.contentType, reject);
    } else if (chunk.type === 'audio') {
      this.appendAudioChunk(chunk.data);
      if (!this.playbackStarted && this.sourceBuffer) {
        this.playbackStarted = true;
        this.startPlayback(volume, rate, resolve, reject);
      }
    } else if (chunk.type === 'error') {
      this.failWithError(new Error(`Streaming synthesis failed: ${chunk.message}`), reject);
      return false;
    }
    return true;
  }

  private async consumeStream(
    stream: AsyncGenerator<StreamChunk>,
    volume: number,
    rate: number,
    resolve: () => void,
    reject: (error: Error) => void
  ): Promise<void> {
    try {
      for await (const chunk of stream) {
        if (this.aborted) return;
        try {
          if (!this.handleStreamChunk(chunk, volume, rate, resolve, reject)) return;
        } catch (err) {
          this.failWithError(this.toError(err), reject);
          return;
        }
      }

      this.streamEnded = true;
      this.tryEndOfStream();
    } catch (err) {
      if (this.aborted) return;
      this.failWithError(this.toError(err), reject);
    }
  }

  private appendBuffer(data: Uint8Array): void {
    if (!this.sourceBuffer || this.aborted) return;

    if (this.isAppending || this.sourceBuffer.updating) {
      this.pendingBuffers.push(data);
      return;
    }

    this.isAppending = true;
    try {
      this.sourceBuffer.appendBuffer(data as unknown as ArrayBuffer);
    } catch (err) {
      this.isAppending = false;
      // QuotaExceededError: buffer full, queue for retry
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        this.pendingBuffers.push(data);
      }
    }
  }

  private flushPendingBuffers(): void {
    this.isAppending = false;
    if (this.aborted) return;

    if (this.pendingBuffers.length > 0) {
      const next = this.pendingBuffers.shift()!;
      this.appendBuffer(next);
    } else if (this.streamEnded) {
      this.tryEndOfStream();
    }
  }

  private tryEndOfStream(): void {
    if (
      this.mediaSource?.readyState !== 'open' ||
      this.isAppending ||
      this.pendingBuffers.length > 0
    ) {
      return;
    }

    if (this.sourceBuffer?.updating) return;

    try {
      this.mediaSource.endOfStream();
    } catch {
      // Already ended or closed
    }
  }

  private startPlayback(
    volume: number,
    rate: number,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    const audio = this.audio!;
    audio.volume = volume;
    audio.playbackRate = rate;

    const onPlay = () => {
      audio.removeEventListener('play', onPlay as EventListener);
      this.callbacks.onStart?.();
    };

    const onEnded = () => {
      removeListeners();
      this.cleanup();
      this.callbacks.onEnd?.();
      resolve();
    };

    const onError = (e: Event) => {
      removeListeners();
      this.cleanup();
      const error = new Error(
        `Audio playback error: ${(e as ErrorEvent).message || 'Unknown error'}`
      );
      this.callbacks.onError?.(error);
      reject(error);
    };

    const removeListeners = () => {
      audio.removeEventListener('play', onPlay as EventListener);
      audio.removeEventListener('ended', onEnded as EventListener);
      audio.removeEventListener('error', onError as EventListener);
    };

    audio.addEventListener('play', onPlay as EventListener);
    audio.addEventListener('ended', onEnded as EventListener);
    audio.addEventListener('error', onError as EventListener);

    audio.play().catch((err) => {
      removeListeners();
      this.cleanup();
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      reject(error);
    });
  }

  private cleanup(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.sourceBuffer = null;
    this.mediaSource = null;
    this.wrapper = null;
    this.audio = null;
    this.pendingBuffers = [];
  }
}
