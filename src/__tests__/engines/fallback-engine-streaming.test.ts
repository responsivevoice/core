/**
 * Tests for FallbackEngine streaming synthesis
 */
import type { StreamChunk } from '@responsivevoice/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPool, IAudioElement } from '../../audio';
import { MediaSourcePlayer } from '../../audio/media-source-player';
import { FallbackEngine } from '../../engines/fallback-engine';
import { resetPlatformInfo } from '../../platform';
import {
  createMockAudioElement,
  createMockAudioPool,
  createMockSynthResponse,
  createTestUtterance,
  type MockAudioElement,
} from '../helpers/engine-mocks';

// Shared mock state for WebSocketConnection (hoisted above vi.mock)
const mockWsInstance: {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  synthesizeStream: ReturnType<typeof vi.fn>;
} = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  synthesizeStream: vi.fn(),
};

// Shared api-client mock: factory lives in helpers/api-client-mock.ts. We
// use `vi.hoisted` to import it into hoist-time scope so `vi.mock` (which
// also hoists) can reference it without relying on runtime imports. The
// WebSocketConnection entry is added locally so streaming tests can swap
// the ws instance.
const { apiClientMockFactory } = await vi.hoisted(
  async () => await import('../helpers/api-client-mock')
);
// Captures the config passed to the most recent `new WebSocketConnection(...)`.
const mockWsCtorConfig: {
  value: { getAuthToken?: () => Promise<string | undefined> } | undefined;
} = { value: undefined };

vi.mock('@responsivevoice/api-client', () => ({
  ...apiClientMockFactory({ withStreaming: true }),
  WebSocketConnection: function WebSocketConnection(config: {
    getAuthToken?: () => Promise<string | undefined>;
  }) {
    mockWsCtorConfig.value = config;
    return mockWsInstance;
  },
}));

/**
 * Create a mock async generator that yields the given chunks
 */
async function* mockStreamGenerator(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Install a `MediaSourcePlayer.play` mock that immediately fires its
 * `onStart` and `onEnd` callbacks — the common happy-path shape for MSE
 * playback tests. Also forces `isSupported` to true.
 */
function installMSEMockPlay() {
  const mockPlay = vi
    .fn()
    .mockImplementation(
      async (
        _audio: IAudioElement,
        _stream: AsyncGenerator<StreamChunk>,
        callbacks: { onStart?: () => void; onEnd?: () => void }
      ) => {
        callbacks.onStart?.();
        callbacks.onEnd?.();
      }
    );

  vi.spyOn(MediaSourcePlayer, 'isSupported').mockReturnValue(true);
  vi.spyOn(MediaSourcePlayer.prototype, 'play').mockImplementation(mockPlay);
  return mockPlay;
}

describe('FallbackEngine streaming', () => {
  let mockApiClient: {
    synthesize: ReturnType<typeof vi.fn>;
    synthesizeStream: ReturnType<typeof vi.fn>;
  };
  let mockAudioPool: AudioPool;
  let mockAudioElement: MockAudioElement;

  /** Construct a FallbackEngine wired to the current beforeEach mocks. */
  const makeEngine = (overrides: Record<string, unknown> = {}) =>
    new FallbackEngine({
      apiClient: mockApiClient as never,
      audioPool: mockAudioPool,
      ...overrides,
    });

  /** Construct a streaming FallbackEngine (transport: 'stream', no estimation timeout). */
  const makeStreamEngine = (overrides: Record<string, unknown> = {}) =>
    makeEngine({ transport: 'stream', enableEstimationTimeout: false, ...overrides });

  /** Have `synthesizeStream` yield the given chunks when called. */
  const stubStreamChunks = (chunks: StreamChunk[]) => {
    mockApiClient.synthesizeStream.mockReturnValue(mockStreamGenerator(chunks));
  };

  /**
   * Stub `synthesizeStream` with a minimal `metadata → 1 audio chunk → end`
   * sequence. Used by content-type extraction tests where the specific
   * chunk data doesn't matter — only the metadata content-type is asserted.
   */
  const stubSimpleAudioStream = (contentType: string, data = new Uint8Array([1])) => {
    stubStreamChunks([
      { type: 'metadata', contentType },
      { type: 'audio', data, chunkIndex: 0 },
      { type: 'end', totalBytes: data.length, totalChunks: 1 },
    ]);
  };

  /**
   * Wait for the MSE src to be set (meaning streaming has started) and then
   * fire the `ended` event to resolve the speak() promise.
   */
  const awaitStreamPlayback = async (speakPromise: Promise<void>) => {
    await vi.waitFor(() => {
      expect(mockAudioElement.src).toBeTruthy();
    });
    mockAudioElement._triggerEvent('ended');
    await speakPromise;
  };

  beforeEach(() => {
    mockApiClient = {
      synthesize: vi.fn().mockResolvedValue(createMockSynthResponse()),
      synthesizeStream: vi.fn(),
    };

    mockAudioElement = createMockAudioElement();
    mockAudioPool = createMockAudioPool(mockAudioElement);

    resetPlatformInfo();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/streamed-audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset shared WS mock state
    mockWsInstance.connect.mockReset().mockResolvedValue(undefined);
    mockWsInstance.close.mockReset();
    mockWsInstance.synthesizeStream.mockReset();
  });

  describe('accumulateStream', () => {
    it('should use synthesizeStream when streaming is enabled', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4, 5]);
      stubStreamChunks([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'audio', data: audioData, chunkIndex: 0 },
        { type: 'end', totalBytes: 5, totalChunks: 1 },
      ]);

      const engine = makeStreamEngine();

      const speakPromise = engine.speak(createTestUtterance());

      // Trigger ended event to resolve the promise
      await vi.waitFor(() => {
        expect(mockAudioElement.src).toBe('blob:http://localhost/streamed-audio');
      });
      mockAudioElement._triggerEvent('ended');
      await speakPromise;

      expect(mockApiClient.synthesizeStream).toHaveBeenCalledTimes(1);
      expect(mockApiClient.synthesize).not.toHaveBeenCalled();
    });

    it('should fall back to synthesize when streaming is disabled', async () => {
      const engine = makeEngine({ transport: 'chunks', enableEstimationTimeout: false });

      const speakPromise = engine.speak(createTestUtterance());

      await vi.waitFor(() => {
        expect(mockAudioElement.src).toBe('blob:http://localhost/mock-audio');
      });
      mockAudioElement._triggerEvent('ended');
      await speakPromise;

      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(1);
      expect(mockApiClient.synthesizeStream).not.toHaveBeenCalled();
    });

    it('should accumulate multiple audio chunks into a single blob', async () => {
      const chunk1 = new Uint8Array([1, 2, 3]);
      const chunk2 = new Uint8Array([4, 5, 6]);
      const chunk3 = new Uint8Array([7, 8, 9]);

      stubStreamChunks([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'audio', data: chunk1, chunkIndex: 0 },
        { type: 'audio', data: chunk2, chunkIndex: 1 },
        { type: 'audio', data: chunk3, chunkIndex: 2 },
        { type: 'end', totalBytes: 9, totalChunks: 3 },
      ]);

      const engine = makeStreamEngine();

      await awaitStreamPlayback(engine.speak(createTestUtterance()));

      // URL.createObjectURL should have been called with a Blob
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('should throw on stream error chunks', async () => {
      stubStreamChunks([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'error', message: 'Provider unavailable', retryable: true },
      ]);

      const engine = makeStreamEngine();

      const captured: { error: Error | null } = { error: null };
      engine.onError = (err: Error) => {
        captured.error = err;
      };

      await expect(engine.speak(createTestUtterance())).rejects.toThrow(
        'Streaming synthesis failed: Provider unavailable'
      );
      expect(captured.error?.message).toBe('Streaming synthesis failed: Provider unavailable');
    });

    it('should use prebuffer cache over streaming', async () => {
      stubSimpleAudioStream('audio/mpeg');

      const engine = makeStreamEngine();

      // Pre-populate the prebuffer cache via prefetchChunks
      const utterance = createTestUtterance();
      await engine.prefetchChunks([utterance]);

      // Now speak — should use cache, not streaming
      const speakPromise = engine.speak(utterance);

      await vi.waitFor(() => {
        expect(mockAudioElement.src).toBeTruthy();
      });
      mockAudioElement._triggerEvent('ended');
      await speakPromise;

      // synthesizeStream was called once for prefetch, synthesize was NOT called
      expect(mockApiClient.synthesizeStream).toHaveBeenCalledTimes(1); // prefetch uses streaming
      expect(mockApiClient.synthesize).not.toHaveBeenCalled();
    });

    it('should extract ogg format from content type', async () => {
      stubSimpleAudioStream('audio/ogg');

      const engine = makeStreamEngine();

      await awaitStreamPlayback(engine.speak(createTestUtterance()));

      // Blob should have been created with audio/ogg type
      expect(URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'audio/ogg' })
      );
    });

    it('should extract wav format from content type', async () => {
      stubSimpleAudioStream('audio/wav');

      const engine = makeStreamEngine();

      await awaitStreamPlayback(engine.speak(createTestUtterance()));

      expect(URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'audio/wav' })
      );
    });
  });

  describe('MSE progressive playback', () => {
    it('should use MediaSourcePlayer when streaming + MSE supported', async () => {
      installMSEMockPlay();
      const engine = makeStreamEngine();

      stubSimpleAudioStream('audio/mpeg');

      const onStart = vi.fn();
      const onEnd = vi.fn();
      engine.onStart = onStart;
      engine.onEnd = onEnd;

      await engine.speak(createTestUtterance());

      expect(MediaSourcePlayer.prototype.play).toHaveBeenCalled();
      expect(mockApiClient.synthesize).not.toHaveBeenCalled();
      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
    });

    it('should fall back to Blob accumulation when MSE not supported', async () => {
      vi.spyOn(MediaSourcePlayer, 'isSupported').mockReturnValue(false);

      stubStreamChunks([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'audio', data: new Uint8Array([1, 2, 3]), chunkIndex: 0 },
        { type: 'end', totalBytes: 3, totalChunks: 1 },
      ]);

      const engine = makeStreamEngine();

      await awaitStreamPlayback(engine.speak(createTestUtterance()));

      // Should have used synthesizeStream (Blob path), not MediaSourcePlayer
      expect(mockApiClient.synthesizeStream).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('should fire onError when MSE playback fails', async () => {
      vi.spyOn(MediaSourcePlayer, 'isSupported').mockReturnValue(true);
      vi.spyOn(MediaSourcePlayer.prototype, 'play').mockRejectedValue(
        new Error('MSE playback failed')
      );

      stubStreamChunks([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'error', message: 'MSE playback failed', retryable: false },
      ]);

      const engine = makeStreamEngine();

      const onError = vi.fn();
      engine.onError = onError;

      await expect(engine.speak(createTestUtterance())).rejects.toThrow('MSE playback failed');
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'MSE playback failed' }),
        expect.objectContaining({ text: expect.any(String) })
      );
    });

    it('should abort MSE player on cancel', async () => {
      vi.spyOn(MediaSourcePlayer, 'isSupported').mockReturnValue(true);

      // Make play() hang indefinitely
      const abortSpy = vi.spyOn(MediaSourcePlayer.prototype, 'abort');
      vi.spyOn(MediaSourcePlayer.prototype, 'play').mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      stubStreamChunks([
        { type: 'metadata', contentType: 'audio/mpeg' },
        { type: 'audio', data: new Uint8Array([1]), chunkIndex: 0 },
      ]);

      const engine = makeStreamEngine();

      // Start speak (will hang due to mock)
      engine.speak(createTestUtterance());

      // Give it a tick to enter speakWithMSE
      await new Promise((r) => setTimeout(r, 10));

      engine.cancel();

      expect(abortSpy).toHaveBeenCalled();
    });

    it('should use WebSocketConnection when transport is websocket', async () => {
      installMSEMockPlay();

      mockWsInstance.synthesizeStream.mockReturnValue(
        mockStreamGenerator([
          { type: 'metadata', contentType: 'audio/mpeg' },
          { type: 'audio', data: new Uint8Array([1, 2]), chunkIndex: 0 },
          { type: 'end', totalBytes: 2, totalChunks: 1 },
        ])
      );

      const engine = new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'websocket',
        enableEstimationTimeout: false,
      });

      await engine.speak(createTestUtterance());

      expect(mockWsInstance.synthesizeStream).toHaveBeenCalled();
      expect(mockApiClient.synthesizeStream).not.toHaveBeenCalled();
    });

    it('forwards getAuthToken to the WebSocketConnection', async () => {
      installMSEMockPlay();

      mockWsInstance.synthesizeStream.mockReturnValue(
        mockStreamGenerator([
          { type: 'metadata', contentType: 'audio/mpeg', prosodyApplied: [] },
          { type: 'end', totalBytes: 0, totalChunks: 0 },
        ])
      );

      const getAuthToken = () => Promise.resolve('the.jwt.token');
      const engine = new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'websocket',
        enableEstimationTimeout: false,
        getAuthToken,
      });

      await engine.speak(createTestUtterance());

      expect(mockWsCtorConfig.value?.getAuthToken).toBe(getAuthToken);
    });

    it('should close WebSocket connection on dispose', async () => {
      installMSEMockPlay();

      mockWsInstance.synthesizeStream.mockReturnValue(
        mockStreamGenerator([
          { type: 'metadata', contentType: 'audio/mpeg' },
          { type: 'end', totalBytes: 0, totalChunks: 0 },
        ])
      );

      const engine = new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'websocket',
        enableEstimationTimeout: false,
      });

      // Trigger WebSocket connection creation
      await engine.speak(createTestUtterance());

      // Dispose should close the WebSocket
      engine.dispose();
      expect(mockWsInstance.close).toHaveBeenCalled();
    });
  });

  describe('autoConnect', () => {
    it('should eagerly connect when transport is websocket', async () => {
      new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'websocket',
        autoConnect: true,
      });

      await vi.waitFor(() => {
        expect(mockWsInstance.connect).toHaveBeenCalledOnce();
      });
    });

    it('should warn when connect fails', async () => {
      mockWsInstance.connect.mockRejectedValueOnce(new Error('connection refused'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'websocket',
        autoConnect: true,
      });

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('WebSocket auto-connect failed: connection refused')
        );
      });

      warnSpy.mockRestore();
    });

    it('should warn when used with non-websocket transport', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'chunks',
        autoConnect: true,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("autoConnect has no effect with transport 'chunks'")
      );
      expect(mockWsInstance.connect).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not connect when autoConnect is false', async () => {
      mockWsInstance.connect.mockClear();

      new FallbackEngine({
        apiKey: 'test-key',
        audioPool: mockAudioPool,
        transport: 'websocket',
        autoConnect: false,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockWsInstance.connect).not.toHaveBeenCalled();
    });
  });
});
