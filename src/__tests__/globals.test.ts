/**
 * Tests for Global Variables Support
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchReadyEvent,
  getGlobalApiEndpoint,
  getGlobalApiKey,
  setGlobalInstance,
} from '../globals';
import { resetPlatformInfo } from '../platform';
import { getResponsiveVoice, ResponsiveVoice, resetResponsiveVoice } from '../responsivevoice';

// Mock the api-client module
vi.mock('@responsivevoice/api-client', () => ({
  ResponsiveVoiceAPIClient: class MockAPIClient {
    async getVoices() {
      return [
        {
          name: 'UK English Female',
          flag: 'gb',
          gender: 'f',
          lang: 'en-GB',
          voiceIDs: [3, 7],
        },
      ];
    }
    async getConfig() {
      return null;
    }
  },
}));

describe('Global Variables Support', () => {
  /** Clear the three rv-related globals that tests may have set on `window`. */
  const clearRvGlobals = () => {
    delete (window as Record<string, unknown>).rvApiKey;
    delete (window as Record<string, unknown>).rvApiEndpoint;
    delete (window as Record<string, unknown>).responsiveVoice;
  };

  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
    clearRvGlobals();
  });

  afterEach(() => {
    resetResponsiveVoice();
    clearRvGlobals();
  });

  describe('getGlobalApiKey', () => {
    it('should return undefined when no global key is set', () => {
      expect(getGlobalApiKey()).toBeUndefined();
    });

    it('should return the global API key when set', () => {
      (window as Record<string, unknown>).rvApiKey = 'global-test-key';
      expect(getGlobalApiKey()).toBe('global-test-key');
    });
  });

  describe('getGlobalApiEndpoint', () => {
    it('should return undefined when no global endpoint is set', () => {
      expect(getGlobalApiEndpoint()).toBeUndefined();
    });

    it('should return the global endpoint when set', () => {
      (window as Record<string, unknown>).rvApiEndpoint = 'https://custom.endpoint.com/api';
      expect(getGlobalApiEndpoint()).toBe('https://custom.endpoint.com/api');
    });
  });

  describe('setGlobalInstance', () => {
    it('should set window.responsiveVoice', () => {
      const mockInstance = { test: true };
      setGlobalInstance(mockInstance);
      expect(window.responsiveVoice).toBe(mockInstance);
    });
  });

  describe('dispatchReadyEvent', () => {
    it('should dispatch ResponsiveVoice_OnReady event', () => {
      const eventListener = vi.fn();
      window.addEventListener('ResponsiveVoice_OnReady', eventListener);

      dispatchReadyEvent();

      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ResponsiveVoice_OnReady',
        })
      );

      window.removeEventListener('ResponsiveVoice_OnReady', eventListener);
    });
  });

  describe('ResponsiveVoice integration with globals', () => {
    it('should use global rvApiKey when no apiKey option provided', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (window as Record<string, unknown>).rvApiKey = 'global-key-123';

      const rv = new ResponsiveVoice();

      // Should NOT be in demo mode because it picked up the global key
      expect(rv.isDemoMode()).toBe(false);

      rv.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should prefer options.apiKey over global rvApiKey', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (window as Record<string, unknown>).rvApiKey = 'global-key-123';

      const rv = new ResponsiveVoice({ apiKey: 'options-key-456' });

      expect(rv.isDemoMode()).toBe(false);

      rv.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should be in demo mode when no key is provided anywhere', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const rv = new ResponsiveVoice();

      expect(rv.isDemoMode()).toBe(true);

      rv.dispose();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getResponsiveVoice singleton with globals', () => {
    it('should set window.responsiveVoice when singleton is created', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const rv = await getResponsiveVoice({ apiKey: 'test-key' });

      expect(window.responsiveVoice).toBe(rv);

      rv.dispose();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('init dispatches ready event', () => {
    it('should dispatch ResponsiveVoice_OnReady event after init', async () => {
      const eventListener = vi.fn();
      window.addEventListener('ResponsiveVoice_OnReady', eventListener);

      const rv = new ResponsiveVoice({ apiKey: 'test-key' });
      await rv.init();

      expect(eventListener).toHaveBeenCalledTimes(1);

      window.removeEventListener('ResponsiveVoice_OnReady', eventListener);
      rv.dispose();
    });

    it('should dispatch ResponsiveVoice_OnReady event in demo mode', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const eventListener = vi.fn();
      window.addEventListener('ResponsiveVoice_OnReady', eventListener);

      const rv = new ResponsiveVoice();
      await rv.init();

      expect(eventListener).toHaveBeenCalledTimes(1);

      window.removeEventListener('ResponsiveVoice_OnReady', eventListener);
      rv.dispose();
      consoleErrorSpy.mockRestore();
    });
  });
});
