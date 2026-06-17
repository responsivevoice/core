/**
 * Global Variables Support for Legacy Compatibility
 *
 * The legacy responsivevoice.js used global variables for configuration.
 * This module provides support for reading these globals when they exist.
 */

/**
 * Global configuration interface for browser environments
 */
export interface ResponsiveVoiceGlobals {
  /** Global API key (set by user before loading library) */
  rvApiKey?: string;
  /** Global API endpoint override */
  rvApiEndpoint?: string;
  /** Global instance (set by library after init) */
  responsiveVoice?: unknown;
}

// Extend Window interface to include legacy globals
declare global {
  interface Window extends ResponsiveVoiceGlobals {
    /** Event dispatched when ResponsiveVoice is ready */
    ResponsiveVoice_OnReady?: Event;
  }
}

/**
 * Get global API key if set
 * @returns The global API key or undefined
 */
export function getGlobalApiKey(): string | undefined {
  if (typeof window !== 'undefined' && window.rvApiKey) {
    return window.rvApiKey;
  }
  return undefined;
}

/**
 * Get global API endpoint if set
 * @returns The global API endpoint or undefined
 */
export function getGlobalApiEndpoint(): string | undefined {
  if (typeof window !== 'undefined' && window.rvApiEndpoint) {
    return window.rvApiEndpoint;
  }
  return undefined;
}

/**
 * Set the global responsiveVoice instance
 * @param instance - The ResponsiveVoice instance
 */
export function setGlobalInstance(instance: unknown): void {
  if (typeof window !== 'undefined') {
    window.responsiveVoice = instance;
  }
}

/**
 * Dispatch the ResponsiveVoice_OnReady event
 */
export function dispatchReadyEvent(): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    const event = new CustomEvent('ResponsiveVoice_OnReady', {
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);
  }
}
