// Vitest setup file for @responsivevoice/core

// Mock speechSynthesis if not available
if (typeof window !== 'undefined' && !window.speechSynthesis) {
  const mockSpeechSynthesis = {
    getVoices: () => [],
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
  };
  Object.defineProperty(window, 'speechSynthesis', {
    value: mockSpeechSynthesis,
    writable: true,
    configurable: true,
  });
}

// Mock SpeechSynthesisUtterance if not available
if (typeof window !== 'undefined' && !window.SpeechSynthesisUtterance) {
  class MockSpeechSynthesisUtterance {
    text: string;
    lang: string;
    voice: SpeechSynthesisVoice | null;
    pitch: number;
    rate: number;
    volume: number;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: unknown) => void) | null;
    onpause: (() => void) | null;
    onresume: (() => void) | null;
    onboundary: ((event: unknown) => void) | null;

    constructor(text: string = '') {
      this.text = text;
      this.lang = '';
      this.voice = null;
      this.pitch = 1;
      this.rate = 1;
      this.volume = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onpause = null;
      this.onresume = null;
      this.onboundary = null;
    }
  }

  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: MockSpeechSynthesisUtterance,
    writable: true,
    configurable: true,
  });
}
