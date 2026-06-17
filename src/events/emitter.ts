/**
 * Event emitter for ResponsiveVoice
 * Provides typed event handling with DOM CustomEvent dispatch for external listeners
 */

import type { RVEventType, TTSService } from '@responsivevoice/types';

import type { EngineType } from '../engines/types.js';
import type { VerificationFailureReason } from '../verification/origin-verification.js';
import type { MatchingStrategy } from '../voice/types.js';

/**
 * Payload types for each event
 */
export interface EventPayload {
  OnLoad: undefined;
  OnReady: undefined;
  OnStart: undefined;
  OnEnd: undefined;
  OnError: { error: Error; message?: string; reason?: VerificationFailureReason };
  OnPause: undefined;
  OnResume: undefined;
  OnServiceSwitched: { from: 'native' | 'fallback'; to: 'native' | 'fallback' };
  OnClickEvent: Record<string, never>;
  OnAllowSpeechClicked: { allowed: boolean };
  OnPartStart: { partIndex: number; totalParts: number; text: string };
  OnPartEnd: { partIndex: number; totalParts: number; text: string };
  OnVoiceResolved: {
    requested: string;
    defaulted: boolean;
    success: boolean;
    resolvedName: string | null;
    resolvedLang: string | null;
    resolutionType: EngineType | null;
    nativeVoiceName: string | null;
    matchStrategy: MatchingStrategy | null;
    fallbackService: TTSService | null;
    fallbackVoiceName: string | null;
    voiceIDs: number[] | null;
    selectorType: 'name' | 'pattern' | 'query' | 'default' | 'override';
  };
}

/**
 * Event callback type
 */
export type EventCallback<E extends RVEventType = RVEventType> = (payload: EventPayload[E]) => void;

/**
 * Generic event callback for backward compatibility.
 *
 * @internal
 * TODO: remove — callers can write `(payload?: unknown) => void` inline or
 * adopt the typed `EventCallback<E>` alternative. Keeping the alias exported
 * in the public surface adds no value beyond the structural type.
 */
export type GenericEventCallback = (payload?: unknown) => void;

/**
 * Event emitter class for ResponsiveVoice
 */
export class EventEmitter {
  private listeners: Map<RVEventType, Set<GenericEventCallback>> = new Map();
  private dispatchDOMEvents: boolean = true;

  /**
   * Create a new event emitter
   * @param dispatchDOMEvents - Whether to also dispatch DOM CustomEvents (default: true)
   */
  constructor(dispatchDOMEvents: boolean = true) {
    this.dispatchDOMEvents = dispatchDOMEvents;
  }

  /**
   * Add an event listener
   * @param event - Event type to listen for
   * @param callback - Callback function
   */
  on<E extends RVEventType>(event: E, callback: EventCallback<E>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as GenericEventCallback);
  }

  /**
   * Add an event listener (alias for on)
   */
  addEventListener<E extends RVEventType>(event: E, callback: EventCallback<E>): void {
    this.on(event, callback);
  }

  /**
   * Remove an event listener
   * @param event - Event type
   * @param callback - Callback function to remove
   */
  off<E extends RVEventType>(event: E, callback: EventCallback<E>): void {
    this.listeners.get(event)?.delete(callback as GenericEventCallback);
  }

  /**
   * Remove an event listener (alias for off)
   */
  removeEventListener<E extends RVEventType>(event: E, callback: EventCallback<E>): void {
    this.off(event, callback);
  }

  /**
   * Add a one-time event listener
   * @param event - Event type
   * @param callback - Callback function (will be removed after first call)
   */
  once<E extends RVEventType>(event: E, callback: EventCallback<E>): void {
    const wrapper: EventCallback<E> = (payload) => {
      this.off(event, wrapper);
      callback(payload);
    };
    this.on(event, wrapper);
  }

  /**
   * Emit an event
   * @param event - Event type to emit
   * @param payload - Event payload (optional for void payloads)
   */
  emit<E extends RVEventType>(
    event: E,
    ...args: EventPayload[E] extends void ? [] : [EventPayload[E]]
  ): void {
    const payload = args[0];
    const callbacks = this.listeners.get(event);

    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(payload);
        } catch (error) {
          // Log error but don't interrupt other handlers
          console.error(`Error in ${event} handler:`, error);
        }
      }
    }

    // Also dispatch as DOM CustomEvent for external listeners
    if (this.dispatchDOMEvents && typeof document !== 'undefined') {
      const customEvent = new CustomEvent(`ResponsiveVoice_${event}`, {
        detail: payload,
        bubbles: false,
        cancelable: false,
      });
      document.dispatchEvent(customEvent);
    }
  }

  /**
   * Remove all listeners for a specific event or all events
   * @param event - Optional event type (removes all if not specified)
   */
  removeAllListeners(event?: RVEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event - Event type
   * @returns Number of listeners
   */
  listenerCount(event: RVEventType): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Check if there are any listeners for an event
   * @param event - Event type
   * @returns True if there are listeners
   */
  hasListeners(event: RVEventType): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Get all event types that have listeners
   * @returns Array of event types
   */
  eventNames(): RVEventType[] {
    return Array.from(this.listeners.keys()).filter((event) => this.listenerCount(event) > 0);
  }

  /**
   * Enable or disable DOM event dispatching
   * @param enabled - Whether to dispatch DOM events
   */
  setDispatchDOMEvents(enabled: boolean): void {
    this.dispatchDOMEvents = enabled;
  }
}
