declare module 'mse-audio-wrapper' {
  interface MSEAudioWrapperOptions {
    codec?: string;
    preferredContainer?: 'webm' | 'fmp4';
    minFramesPerSegment?: number;
    maxFramesPerSegment?: number;
    minBytesPerSegment?: number;
    enableLogging?: boolean;
    onMimeType?: (mimeType: string) => void;
    onCodecUpdate?: (codecInfo: unknown, updateTimestamp: number) => void;
  }

  export default class MSEAudioWrapper {
    constructor(mimeType: string, options?: MSEAudioWrapperOptions);
    get mimeType(): string;
    get inputMimeType(): string;
    iterator(chunk: Uint8Array): Generator<Uint8Array>;
  }

  export function getWrappedMimeType(
    codec: string,
    container?: 'webm' | 'fmp4'
  ): string | undefined;
}
