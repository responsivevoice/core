/**
 * Analytics Tracker Module
 *
 * Tracks character usage and sends analytics data to the server
 * using navigator.sendBeacon for reliable delivery during page unload.
 */

/**
 * Analytics configuration options
 */
export interface AnalyticsConfig {
  /** API key for authentication */
  apiKey?: string;
  /** Analytics endpoint URL */
  endpoint?: string;
  /** Enable/disable analytics tracking */
  enabled?: boolean;
}

/**
 * Analytics session data sent to the server
 */
export interface AnalyticsPayload {
  /** API key */
  key: string;
  /** Character count for this session */
  chars: number;
  /** Timestamp of the session */
  timestamp?: number;
}

/**
 * Default analytics endpoint
 */
export const DEFAULT_ANALYTICS_ENDPOINT = 'https://app.responsivevoice.org/analytics/cc/session';

/**
 * AnalyticsTracker tracks character usage and sends session data
 *
 * Usage:
 * ```typescript
 * const tracker = new AnalyticsTracker({ apiKey: 'your-key' });
 * tracker.trackCharacters('Hello world'); // Adds 11 chars
 * tracker.trackCharacters('More text');   // Adds 9 chars
 * // On page unload, sends { key: 'your-key', chars: 20 }
 * ```
 */
export class AnalyticsTracker {
  private characterCount = 0;
  private apiKey: string | undefined;
  private endpoint: string;
  private enabled: boolean;
  private boundBeforeUnload: (() => void) | null = null;
  private hasWindow: boolean;

  constructor(config: AnalyticsConfig = {}) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint ?? DEFAULT_ANALYTICS_ENDPOINT;
    this.enabled = config.enabled ?? true;
    this.hasWindow = typeof window !== 'undefined';

    if (this.hasWindow && this.enabled) {
      this.setupBeforeUnload();
    }
  }

  /**
   * Track characters from spoken text
   */
  trackCharacters(text: string): void {
    if (!this.enabled || !text) {
      return;
    }
    this.characterCount += text.length;
  }

  /**
   * Get current character count
   */
  getCharacterCount(): number {
    return this.characterCount;
  }

  /**
   * Reset character count (called after successful send)
   */
  resetCharacterCount(): void {
    this.characterCount = 0;
  }

  /**
   * Set the API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get the API key
   */
  getApiKey(): string | undefined {
    return this.apiKey;
  }

  /**
   * Enable or disable analytics
   */
  setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;

    if (this.hasWindow) {
      if (enabled && !wasEnabled) {
        this.setupBeforeUnload();
      } else if (!enabled && wasEnabled) {
        this.teardownBeforeUnload();
      }
    }
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Manually send analytics data (useful for SPA navigation)
   * Returns true if data was sent successfully
   */
  sendNow(): boolean {
    return this.sendAnalytics();
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.teardownBeforeUnload();
    this.characterCount = 0;
  }

  /**
   * Setup beforeunload event listener
   */
  private setupBeforeUnload(): void {
    if (this.boundBeforeUnload || !this.hasWindow) {
      return;
    }

    this.boundBeforeUnload = () => {
      this.sendAnalytics();
    };

    window.addEventListener('beforeunload', this.boundBeforeUnload);
  }

  /**
   * Remove beforeunload event listener
   */
  private teardownBeforeUnload(): void {
    if (!this.boundBeforeUnload || !this.hasWindow) {
      return;
    }

    window.removeEventListener('beforeunload', this.boundBeforeUnload);
    this.boundBeforeUnload = null;
  }

  /**
   * Send analytics data using sendBeacon
   */
  private sendAnalytics(): boolean {
    if (!this.enabled || this.characterCount === 0 || !this.apiKey) {
      return false;
    }

    const payload: AnalyticsPayload = {
      key: this.apiKey,
      chars: this.characterCount,
      timestamp: Date.now(),
    };

    const data = JSON.stringify(payload);
    let sent = false;

    // Use sendBeacon if available (preferred for unload events)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(this.endpoint, data);
      } catch {
        sent = false;
      }
    }

    // Fallback to synchronous XHR (for older browsers)
    if (!sent && typeof XMLHttpRequest !== 'undefined') {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.endpoint, false); // Synchronous for beforeunload
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(data);
        sent = xhr.status >= 200 && xhr.status < 300;
      } catch {
        sent = false;
      }
    }

    if (sent) {
      this.resetCharacterCount();
    }

    return sent;
  }
}

/**
 * Singleton instance for global analytics tracking
 */
let globalTracker: AnalyticsTracker | null = null;

/**
 * Get or create the global analytics tracker
 */
export function getAnalyticsTracker(config?: AnalyticsConfig): AnalyticsTracker {
  if (!globalTracker) {
    globalTracker = new AnalyticsTracker(config);
  } else if (config?.apiKey) {
    globalTracker.setApiKey(config.apiKey);
  }
  return globalTracker;
}

/**
 * Reset the global analytics tracker (for testing)
 */
export function resetAnalyticsTracker(): void {
  if (globalTracker) {
    globalTracker.dispose();
    globalTracker = null;
  }
}
