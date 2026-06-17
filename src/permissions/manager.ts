/**
 * Permission Manager
 *
 * State machine for managing TTS permissions, user interaction detection,
 * and iOS audio context unlock.
 */

import { USER_INTERACTION_EVENTS } from '../config';
import type { PlatformInfo } from '../platform';
import { IOSUnlockError, unlockiOSAudio } from './ios-unlock';

/**
 * Permission state
 * - pending: Initial state, waiting for user interaction
 * - unlocking: iOS audio unlock in progress
 * - unlocked: TTS is ready to use
 * - error: Unlock failed
 */
export type PermissionState = 'pending' | 'unlocking' | 'unlocked' | 'error';

/**
 * Reason a PermissionManager rejected pending `waitForPermission()` consumers.
 *
 * - `destroyed` — the manager was disposed.
 * - `reset` — the manager was reset to its initial state.
 */
export type PermissionManagerAbortReason = 'destroyed' | 'reset';

/**
 * Rejection sentinel for pending `waitForPermission()` promises when the
 * manager is `destroy()`ed or `reset()`. Distinct from real unlock failures
 * so consumers can `instanceof`-check and drop the in-flight operation.
 */
export class PermissionManagerAbortedError extends Error {
  constructor(public readonly reason: PermissionManagerAbortReason) {
    super(`Permission manager ${reason}`);
    this.name = 'PermissionManagerAbortedError';
  }
}

/**
 * Permission manager configuration
 */
export interface PermissionConfig {
  /**
   * Disable permission popup/prompts
   * @defaultValue false
   */
  disablePermissionPopup?: boolean;

  /**
   * Show permission UI on all platforms (not just iOS)
   * @defaultValue false
   */
  allowPermissionPopupEverywhere?: boolean;
}

/**
 * Callback type for ready listeners
 */
export type ReadyCallback = () => void;

/**
 * Error callback type
 */
export type ErrorCallback = (error: Error) => void;

/**
 * State change callback type
 */
export type StateChangeCallback = (newState: PermissionState, oldState: PermissionState) => void;

/**
 * Permission Manager
 *
 * Manages the permission state machine for TTS operations.
 * Handles user interaction detection and iOS audio context unlock.
 */
export class PermissionManager {
  private state: PermissionState = 'pending';
  private userInteracted: boolean = false;
  private iOSUnlocked: boolean = false;
  private listening: boolean = false;
  private suppressNext: boolean = false;
  private destroyed: boolean = false;

  private readyListeners: Set<ReadyCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private stateChangeListeners: Set<StateChangeCallback> = new Set();
  private pendingPromises: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  // Bound handler for event listener removal
  private boundHandleInteraction: () => void;

  constructor(
    private readonly platform: PlatformInfo,
    private readonly _config: PermissionConfig = {}
  ) {
    this.boundHandleInteraction = this.handleInteraction.bind(this);

    // On platforms that don't require user interaction, immediately unlock
    if (!this.platform.requiresUserInteraction) {
      this.setState('unlocked');
    }
  }

  /**
   * Get the current permission state
   */
  getState(): PermissionState {
    return this.state;
  }

  /**
   * Check if TTS is ready to use
   */
  isReady(): boolean {
    return this.state === 'unlocked';
  }

  /**
   * Check if user has interacted with the page
   */
  hasUserInteracted(): boolean {
    return this.userInteracted;
  }

  /**
   * Check if iOS audio has been unlocked
   */
  isiOSUnlocked(): boolean {
    return this.iOSUnlocked;
  }

  /**
   * Get the current configuration
   */
  getConfig(): PermissionConfig {
    return { ...this._config };
  }

  /**
   * Start listening for user interactions
   *
   * Attaches event listeners for common user interaction events.
   * On first interaction, triggers the unlock process.
   */
  startListening(): void {
    if (this.listening) {
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // Not in browser environment
      return;
    }

    this.listening = true;

    for (const event of USER_INTERACTION_EVENTS) {
      document.addEventListener(event, this.boundHandleInteraction, {
        once: false,
        passive: true,
        capture: true,
      });
    }
  }

  /**
   * Stop listening for user interactions
   *
   * Removes all event listeners. Call this when the manager is no longer needed.
   */
  stopListening(): void {
    if (!this.listening) {
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    this.listening = false;

    for (const event of USER_INTERACTION_EVENTS) {
      document.removeEventListener(event, this.boundHandleInteraction, {
        capture: true,
      });
    }
  }

  /**
   * Check if currently listening for interactions
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * Manually trigger unlock
   *
   * Call this if you know user interaction has already happened
   * (e.g., from a click handler you control).
   *
   * @throws Error if unlock fails on iOS
   */
  async unlock(): Promise<void> {
    if (this.state === 'unlocked') {
      return;
    }

    if (this.state === 'unlocking') {
      // Wait for current unlock to complete
      return this.waitForPermission();
    }

    this.userInteracted = true;
    await this.performUnlock();
  }

  /**
   * Wait for permission to be granted
   *
   * Returns a promise that resolves when TTS is ready to use.
   * If already unlocked, resolves immediately.
   *
   * @throws Error if in error state
   */
  waitForPermission(): Promise<void> {
    if (this.state === 'unlocked') {
      return Promise.resolve();
    }

    if (this.state === 'error') {
      return Promise.reject(new Error('Permission unlock failed'));
    }

    return new Promise((resolve, reject) => {
      this.pendingPromises.push({ resolve, reject });
    });
  }

  /**
   * Add callback for when permission is granted
   * @param callback - Function to call when TTS is ready
   */
  onReady(callback: ReadyCallback): void {
    this.readyListeners.add(callback);

    // If already ready, call immediately
    if (this.state === 'unlocked') {
      try {
        callback();
      } catch {
        // Ignore errors in callbacks
      }
    }
  }

  /**
   * Remove ready callback
   * @param callback - Function to remove
   */
  offReady(callback: ReadyCallback): void {
    this.readyListeners.delete(callback);
  }

  /**
   * Add callback for when an error occurs
   * @param callback - Function to call on error
   */
  onError(callback: ErrorCallback): void {
    this.errorListeners.add(callback);
  }

  /**
   * Remove error callback
   * @param callback - Function to remove
   */
  offError(callback: ErrorCallback): void {
    this.errorListeners.delete(callback);
  }

  /**
   * Add callback for state changes
   * @param callback - Function to call on state change
   */
  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeListeners.add(callback);
  }

  /**
   * Remove state change callback
   * @param callback - Function to remove
   */
  offStateChange(callback: StateChangeCallback): void {
    this.stateChangeListeners.delete(callback);
  }

  /**
   * Stop listening, clear all callbacks, and reject pending
   * `waitForPermission()` consumers with a
   * {@link PermissionManagerAbortedError} (`reason: 'destroyed'`).
   * Subsequent state checks return `isDestroyed() === true`.
   */
  destroy(): void {
    this.destroyed = true;
    this.stopListening();
    this.readyListeners.clear();
    this.errorListeners.clear();
    this.stateChangeListeners.clear();
    this.abortPendingPromises('destroyed');
  }

  /** Whether `destroy()` has been called on this manager. */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Reset to initial state. Pending `waitForPermission()` consumers reject
   * with a {@link PermissionManagerAbortedError} (`reason: 'reset'`).
   */
  reset(): void {
    this.stopListening();
    this.state = 'pending';
    this.userInteracted = false;
    this.iOSUnlocked = false;
    this.suppressNext = false;
    this.abortPendingPromises('reset');

    if (!this.platform.requiresUserInteraction) {
      this.setState('unlocked');
    }
  }

  /**
   * Skip the silent unlock utterance on the next interaction; flip directly
   * to `'unlocked'` instead. One-shot — cleared after the next interaction
   * handles it. Used when the caller knows a real `speak()` is about to
   * fire in the same gesture and will itself serve as the iOS unlock.
   */
  suppressNextUnlock(): void {
    this.suppressNext = true;
  }

  private abortPendingPromises(reason: PermissionManagerAbortReason): void {
    const pending = this.pendingPromises;
    this.pendingPromises = [];
    const err = new PermissionManagerAbortedError(reason);
    for (const { reject } of pending) {
      reject(err);
    }
  }

  /**
   * Capture-phase listener for `USER_INTERACTION_EVENTS`. Defers the actual
   * unlock by one microtask so a bubble-phase `speak()` in the same event
   * can call `suppressNextUnlock()` first; rejections from `performUnlock`
   * are swallowed here because DOM listeners can't observe the returned
   * promise (any leak would surface as `unhandledrejection`).
   */
  private handleInteraction = async (): Promise<void> => {
    if (this.userInteracted) {
      return;
    }

    this.userInteracted = true;
    this.stopListening();

    await Promise.resolve();

    try {
      await this.performUnlock();
    } catch {
      // performUnlock already routes errors via notifyError.
    }
  };

  private async performUnlock(): Promise<void> {
    if (this.suppressNext) {
      this.suppressNext = false;
      if (this.platform.isIOS) {
        this.iOSUnlocked = true;
      }
      this.setState('unlocked');
      return;
    }

    if (this.platform.isIOS && !this.iOSUnlocked) {
      this.setState('unlocking');

      try {
        await unlockiOSAudio();
        this.iOSUnlocked = true;
        this.setState('unlocked');
      } catch (error) {
        const err = error instanceof Error ? error : new IOSUnlockError(String(error), undefined);
        this.setState('error');
        this.notifyError(err);
        throw err;
      }
    } else {
      // Non-iOS platforms or iOS already unlocked
      this.setState('unlocked');
    }
  }

  /**
   * Set state and notify listeners
   */
  private setState(newState: PermissionState): void {
    if (this.state === newState) {
      return;
    }

    const oldState = this.state;
    this.state = newState;

    // Notify state change listeners
    for (const callback of this.stateChangeListeners) {
      try {
        callback(newState, oldState);
      } catch {
        // Ignore errors in callbacks
      }
    }

    // Handle state-specific notifications
    if (newState === 'unlocked') {
      this.notifyReady();
    }
  }

  /**
   * Notify ready listeners and resolve pending promises
   */
  private notifyReady(): void {
    // Notify callbacks
    for (const callback of this.readyListeners) {
      try {
        callback();
      } catch {
        // Ignore errors in callbacks
      }
    }

    // Resolve pending promises
    for (const { resolve } of this.pendingPromises) {
      resolve();
    }
    this.pendingPromises = [];
  }

  /**
   * Notify error listeners and reject pending promises
   */
  private notifyError(error: Error): void {
    // Notify callbacks
    for (const callback of this.errorListeners) {
      try {
        callback(error);
      } catch {
        // Ignore errors in callbacks
      }
    }

    // Reject pending promises
    for (const { reject } of this.pendingPromises) {
      reject(error);
    }
    this.pendingPromises = [];
  }
}
