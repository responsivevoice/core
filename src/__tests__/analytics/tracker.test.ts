import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnalyticsTracker,
  DEFAULT_ANALYTICS_ENDPOINT,
  getAnalyticsTracker,
  resetAnalyticsTracker,
} from '../../analytics';

describe('AnalyticsTracker', () => {
  let tracker: AnalyticsTracker;

  beforeEach(() => {
    tracker = new AnalyticsTracker({ apiKey: 'test-key' });
  });

  afterEach(() => {
    tracker.dispose();
    resetAnalyticsTracker();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create tracker with default config', () => {
      const t = new AnalyticsTracker();
      expect(t.isEnabled()).toBe(true);
      expect(t.getCharacterCount()).toBe(0);
      t.dispose();
    });

    it('should create tracker with custom config', () => {
      const t = new AnalyticsTracker({
        apiKey: 'custom-key',
        enabled: false,
      });
      expect(t.isEnabled()).toBe(false);
      expect(t.getApiKey()).toBe('custom-key');
      t.dispose();
    });
  });

  describe('trackCharacters', () => {
    it('should track character count', () => {
      tracker.trackCharacters('Hello');
      expect(tracker.getCharacterCount()).toBe(5);
    });

    it('should accumulate character count', () => {
      tracker.trackCharacters('Hello');
      tracker.trackCharacters(' World');
      expect(tracker.getCharacterCount()).toBe(11);
    });

    it('should not track when disabled', () => {
      tracker.setEnabled(false);
      tracker.trackCharacters('Hello');
      expect(tracker.getCharacterCount()).toBe(0);
    });

    it('should not track empty string', () => {
      tracker.trackCharacters('');
      expect(tracker.getCharacterCount()).toBe(0);
    });
  });

  describe('resetCharacterCount', () => {
    it('should reset count to zero', () => {
      tracker.trackCharacters('Hello');
      tracker.resetCharacterCount();
      expect(tracker.getCharacterCount()).toBe(0);
    });
  });

  describe('setApiKey', () => {
    it('should update API key', () => {
      tracker.setApiKey('new-key');
      expect(tracker.getApiKey()).toBe('new-key');
    });
  });

  describe('setEnabled', () => {
    it('should enable tracking', () => {
      tracker.setEnabled(false);
      expect(tracker.isEnabled()).toBe(false);
      tracker.setEnabled(true);
      expect(tracker.isEnabled()).toBe(true);
    });
  });

  describe('sendNow', () => {
    it('should return false when no characters tracked', () => {
      const result = tracker.sendNow();
      expect(result).toBe(false);
    });

    it('should return false when disabled', () => {
      tracker.trackCharacters('Hello');
      tracker.setEnabled(false);
      const result = tracker.sendNow();
      expect(result).toBe(false);
    });

    it('should return false when no API key', () => {
      const t = new AnalyticsTracker({ enabled: true });
      t.trackCharacters('Hello');
      const result = t.sendNow();
      expect(result).toBe(false);
      t.dispose();
    });

    it('should use sendBeacon when available', () => {
      const sendBeaconMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal('navigator', { sendBeacon: sendBeaconMock });

      tracker.trackCharacters('Hello');
      const result = tracker.sendNow();

      expect(result).toBe(true);
      expect(sendBeaconMock).toHaveBeenCalledWith(
        DEFAULT_ANALYTICS_ENDPOINT,
        expect.stringContaining('"key":"test-key"')
      );
      expect(sendBeaconMock).toHaveBeenCalledWith(
        DEFAULT_ANALYTICS_ENDPOINT,
        expect.stringContaining('"chars":5')
      );
      expect(tracker.getCharacterCount()).toBe(0); // Reset after send
    });

    it('should fall back to XHR when sendBeacon unavailable', () => {
      const openMock = vi.fn();
      const setRequestHeaderMock = vi.fn();
      const sendMock = vi.fn();

      // Use a class to properly mock XMLHttpRequest constructor
      class MockXHR {
        open = openMock;
        setRequestHeader = setRequestHeaderMock;
        send = sendMock;
        status = 200;
      }

      vi.stubGlobal('navigator', {});
      vi.stubGlobal('XMLHttpRequest', MockXHR);

      tracker.trackCharacters('Hello');
      const result = tracker.sendNow();

      expect(result).toBe(true);
      expect(openMock).toHaveBeenCalledWith('POST', DEFAULT_ANALYTICS_ENDPOINT, false);
      expect(sendMock).toHaveBeenCalled();
    });

    it('should handle sendBeacon failure', () => {
      const sendBeaconMock = vi.fn().mockReturnValue(false);
      vi.stubGlobal('navigator', { sendBeacon: sendBeaconMock });
      vi.stubGlobal('XMLHttpRequest', undefined);

      tracker.trackCharacters('Hello');
      const result = tracker.sendNow();

      expect(result).toBe(false);
      expect(tracker.getCharacterCount()).toBe(5); // Not reset
    });

    it('should handle XHR error', () => {
      vi.stubGlobal('navigator', {});
      vi.stubGlobal(
        'XMLHttpRequest',
        vi.fn(() => {
          throw new Error('XHR not supported');
        })
      );

      tracker.trackCharacters('Hello');
      const result = tracker.sendNow();

      expect(result).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should reset character count', () => {
      tracker.trackCharacters('Hello');
      tracker.dispose();
      expect(tracker.getCharacterCount()).toBe(0);
    });
  });

  describe('DEFAULT_ANALYTICS_ENDPOINT', () => {
    it('should be the correct URL', () => {
      expect(DEFAULT_ANALYTICS_ENDPOINT).toBe(
        'https://app.responsivevoice.org/analytics/cc/session'
      );
    });
  });
});

describe('getAnalyticsTracker', () => {
  afterEach(() => {
    resetAnalyticsTracker();
  });

  it('should return singleton instance', () => {
    const t1 = getAnalyticsTracker({ apiKey: 'key1' });
    const t2 = getAnalyticsTracker();
    expect(t1).toBe(t2);
  });

  it('should update API key on subsequent calls', () => {
    const t1 = getAnalyticsTracker({ apiKey: 'key1' });
    const t2 = getAnalyticsTracker({ apiKey: 'key2' });
    expect(t1.getApiKey()).toBe('key2');
    expect(t1).toBe(t2);
  });
});

describe('resetAnalyticsTracker', () => {
  it('should create new instance after reset', () => {
    const t1 = getAnalyticsTracker({ apiKey: 'key1' });
    resetAnalyticsTracker();
    const t2 = getAnalyticsTracker({ apiKey: 'key2' });
    expect(t1).not.toBe(t2);
    expect(t2.getApiKey()).toBe('key2');
  });
});
