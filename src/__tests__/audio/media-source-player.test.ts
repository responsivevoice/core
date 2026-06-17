/**
 * Tests for MediaSourcePlayer - progressive MSE audio playback
 */
import type { StreamChunk } from '@responsivevoice/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaSourcePlayer } from '../../audio/media-source-player';
import { createMockAudioElementMultiListener } from '../helpers/engine-mocks';

// Mock mse-audio-wrapper
vi.mock('mse-audio-wrapper', () => {
  return {
    default: class MockMSEAudioWrapper {
      private _onMimeType: ((mimeType: string) => void) | undefined;

      constructor(_mimeType: string, options: { onMimeType?: (mimeType: string) => void } = {}) {
        this._onMimeType = options.onMimeType;
        // Simulate async codec detection by calling onMimeType on first iterator call
        this._mimeTypeFired = false;
      }

      private _mimeTypeFired: boolean;

      *iterator(chunk: Uint8Array): Generator<Uint8Array> {
        if (!this._mimeTypeFired) {
          this._mimeTypeFired = true;
          this._onMimeType?.('audio/mp4;codecs="mp3"');
        }
        // Return the chunk as-is (simulating wrapped output)
        yield chunk;
      }
    },
  };
});

// Mock MediaSource
class MockSourceBuffer extends EventTarget {
  updating = false;
  appendBuffer(_data: ArrayBuffer | ArrayBufferView): void {
    this.updating = true;
    // Simulate async appendBuffer completion
    queueMicrotask(() => {
      this.updating = false;
      this.dispatchEvent(new Event('updateend'));
    });
  }
}

class MockMediaSource extends EventTarget {
  readyState = 'closed';
  private _sourceBuffers: MockSourceBuffer[] = [];

  addSourceBuffer(_mimeType: string): MockSourceBuffer {
    const sb = new MockSourceBuffer();
    this._sourceBuffers.push(sb);
    return sb as unknown as MockSourceBuffer;
  }

  endOfStream(): void {
    this.readyState = 'ended';
  }

  // Simulate sourceopen by calling it after objectURL is created
  _open(): void {
    this.readyState = 'open';
    this.dispatchEvent(new Event('sourceopen'));
  }
}

// Patch global
const originalMediaSource = globalThis.MediaSource;
let _lastMockMediaSource: MockMediaSource | null = null;

// MSE tests need a mock element that records multiple listeners per event
// (array-based) to verify listener registration order and removal — see
// `createMockAudioElementMultiListener` in helpers/engine-mocks.ts.
const createMockAudioElement = createMockAudioElementMultiListener;

async function* mockStreamGenerator(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Canonical single-audio-chunk stream: `metadata → 1 audio chunk → end`.
 * Used by tests that only care about the stream lifecycle, not its contents.
 */
const simpleStream = () =>
  mockStreamGenerator([
    { type: 'metadata', contentType: 'audio/mpeg' },
    { type: 'audio', data: new Uint8Array([1]), chunkIndex: 0 },
    { type: 'end', totalBytes: 1, totalChunks: 1 },
  ]);

describe('MediaSourcePlayer', () => {
  beforeEach(() => {
    // Install mock MediaSource globally
    Object.defineProperty(globalThis, 'MediaSource', {
      value: class extends MockMediaSource {},
      writable: true,
      configurable: true,
    });

    // Intercept URL.createObjectURL to trigger sourceopen
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      if (obj instanceof MockMediaSource) {
        _lastMockMediaSource = obj;
        // Trigger sourceopen async
        queueMicrotask(() => obj._open());
      }
      return 'blob:mock-mse-url';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalMediaSource) {
      Object.defineProperty(globalThis, 'MediaSource', {
        value: originalMediaSource,
        writable: true,
        configurable: true,
      });
    } else {
      delete (globalThis as Record<string, unknown>).MediaSource;
    }
    _lastMockMediaSource = null;
    vi.restoreAllMocks();
  });

  describe('isSupported', () => {
    it('returns true when MediaSource is available', () => {
      expect(MediaSourcePlayer.isSupported()).toBe(true);
    });

    it('returns true when only ManagedMediaSource is available', () => {
      delete (globalThis as Record<string, unknown>).MediaSource;
      (globalThis as Record<string, unknown>).ManagedMediaSource = MockMediaSource;

      expect(MediaSourcePlayer.isSupported()).toBe(true);

      delete (globalThis as Record<string, unknown>).ManagedMediaSource;
    });

    it('returns false when neither MediaSource nor ManagedMediaSource exist', () => {
      delete (globalThis as Record<string, unknown>).MediaSource;
      expect(MediaSourcePlayer.isSupported()).toBe(false);
    });
  });

  describe('play', () => {
    it('starts playback after first audio segment is buffered', async () => {
      const audio = createMockAudioElement();
      const player = new MediaSourcePlayer();
      const onStart = vi.fn();
      const onEnd = vi.fn();

      const stream = mockStreamGenerator([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'audio', data: new Uint8Array([1, 2, 3, 4]), chunkIndex: 0 },
        { type: 'end', totalBytes: 4, totalChunks: 1 },
      ]);

      const playPromise = player.play(audio, stream, { onStart, onEnd });

      // Wait for the stream to be consumed and playback to start
      await vi.waitFor(() => {
        expect(audio.play).toHaveBeenCalled();
      });

      expect(onStart).toHaveBeenCalled();
      expect(audio.src).toBe('blob:mock-mse-url');

      // Trigger ended to resolve
      audio._triggerEvent('ended');
      await playPromise;

      expect(onEnd).toHaveBeenCalled();
    });

    it('handles multiple audio chunks progressively', async () => {
      const audio = createMockAudioElement();
      const player = new MediaSourcePlayer();
      const onStart = vi.fn();

      const stream = mockStreamGenerator([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'audio', data: new Uint8Array([1, 2]), chunkIndex: 0 },
        { type: 'audio', data: new Uint8Array([3, 4]), chunkIndex: 1 },
        { type: 'audio', data: new Uint8Array([5, 6]), chunkIndex: 2 },
        { type: 'end', totalBytes: 6, totalChunks: 3 },
      ]);

      const playPromise = player.play(audio, stream, { onStart });

      await vi.waitFor(() => {
        expect(audio.play).toHaveBeenCalled();
      });

      // play() should be called only once (after first segment)
      expect(audio.play).toHaveBeenCalledTimes(1);

      audio._triggerEvent('ended');
      await playPromise;
    });

    it('applies volume and rate to audio element', async () => {
      const audio = createMockAudioElement();
      const player = new MediaSourcePlayer();

      const playPromise = player.play(audio, simpleStream(), {}, 0.7, 1.5);

      await vi.waitFor(() => {
        expect(audio.play).toHaveBeenCalled();
      });

      expect(audio.volume).toBe(0.7);
      expect(audio.playbackRate).toBe(1.5);

      audio._triggerEvent('ended');
      await playPromise;
    });

    it('rejects on stream error chunk', async () => {
      const audio = createMockAudioElement();
      const player = new MediaSourcePlayer();
      const onError = vi.fn();

      const stream = mockStreamGenerator([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'error', message: 'Provider down', retryable: false },
      ]);

      await expect(player.play(audio, stream, { onError })).rejects.toThrow(
        'Streaming synthesis failed: Provider down'
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Streaming synthesis failed: Provider down' })
      );
    });

    it('rejects on audio play() failure', async () => {
      const audio = createMockAudioElement();
      const playError = new Error('NotAllowedError: user gesture required');
      audio.play = vi.fn().mockRejectedValue(playError);

      const player = new MediaSourcePlayer();
      const onError = vi.fn();

      await expect(player.play(audio, simpleStream(), { onError })).rejects.toThrow(
        'NotAllowedError'
      );

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('stops consuming stream and cleans up', async () => {
      const audio = createMockAudioElement();
      const player = new MediaSourcePlayer();

      // Create a stream that yields slowly
      async function* slowStream(): AsyncGenerator<StreamChunk> {
        yield { type: 'metadata', contentType: 'audio/mpeg' };
        yield { type: 'audio', data: new Uint8Array([1, 2]), chunkIndex: 0 };
        // This will be aborted before reaching here
        await new Promise((resolve) => setTimeout(resolve, 5000));
        yield { type: 'audio', data: new Uint8Array([3, 4]), chunkIndex: 1 };
        yield { type: 'end', totalBytes: 4, totalChunks: 2 };
      }

      const _playPromise = player.play(audio, slowStream(), {});

      await vi.waitFor(() => {
        expect(audio.play).toHaveBeenCalled();
      });

      player.abort();

      // After abort, the object URL should be cleaned up
      expect(player.getObjectUrl()).toBeNull();
    });
  });
});
