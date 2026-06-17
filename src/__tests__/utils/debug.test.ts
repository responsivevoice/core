/**
 * Tests for Debug Utilities
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debugLog, isDebugEnabled, resetDebug, setDebug } from '../../utils';

describe('Debug Utilities', () => {
  beforeEach(() => {
    resetDebug();
  });

  afterEach(() => {
    resetDebug();
  });

  describe('setDebug / isDebugEnabled', () => {
    it('should be disabled by default', () => {
      expect(isDebugEnabled()).toBe(false);
    });

    it('should enable debug mode', () => {
      setDebug(true);
      expect(isDebugEnabled()).toBe(true);
    });

    it('should disable debug mode', () => {
      setDebug(true);
      expect(isDebugEnabled()).toBe(true);
      setDebug(false);
      expect(isDebugEnabled()).toBe(false);
    });
  });

  describe('debugLog', () => {
    it('should not log when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      debugLog('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      setDebug(true);
      debugLog('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[ResponsiveVoice] Test message');
      consoleSpy.mockRestore();
    });

    it('should include additional arguments', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      setDebug(true);
      debugLog('Test message', { key: 'value' }, 123);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ResponsiveVoice] Test message',
        { key: 'value' },
        123
      );
      consoleSpy.mockRestore();
    });
  });

  describe('resetDebug', () => {
    it('should reset debug state to false', () => {
      setDebug(true);
      expect(isDebugEnabled()).toBe(true);

      resetDebug();
      expect(isDebugEnabled()).toBe(false);
    });
  });
});
