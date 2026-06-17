/**
 * Permission Popup
 *
 * Shows a permission dialog for speech synthesis on platforms that
 * require user interaction (iOS, Android, Safari with fallback).
 */

import { generatePopupStyles, POPUP_STYLE_ID, POPUP_STYLES } from './popup-styles';

/**
 * Options for the permission popup (per-call overrides)
 */
export interface PermissionPopupOptions {
  /** Override the origin/hostname shown in the popup */
  urlOverride?: string;
  /** Override the action text (default: "wants to play speech") */
  textOverride?: string;
  /** Override the ALLOW button label (default: "ALLOW") */
  allowLabel?: string;
  /** Override the DENY button label (default: "DENY") */
  denyLabel?: string;
  /** Position of the popup bar (default: "bottom") */
  position?: 'top' | 'bottom';
  /** Append popup to a specific container instead of document.body */
  appendTo?: HTMLElement;
  /** CSS class prefix to replace the default "rv" prefix (e.g. "myapp" → "myappNotification") */
  classPrefix?: string;
  /**
   * Custom renderer — return your own HTMLElement for full control.
   * Called with allow/deny callbacks; when invoked, skips the default popup entirely.
   */
  renderPopup?: (onAllow: () => void, onDeny: () => void) => HTMLElement;
}

/**
 * Configuration for PermissionPopup
 */
export interface PermissionPopupConfig {
  /** Callback when user allows or denies */
  onResponse?: (allowed: boolean) => void;
  /** Callback to trigger click event (iOS/Android unlock) */
  onClickEvent?: () => void;
}

/**
 * Scheduled speak data for resuming after permission
 */
export interface ScheduledSpeak {
  text: string;
  voiceName?: string;
  parameters?: Record<string, unknown>;
}

/**
 * Permission Popup Manager
 *
 * Handles the permission dialog for speech synthesis.
 */
export class PermissionPopup {
  private config: PermissionPopupConfig;
  private popupElement: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private appearanceCount = 0;

  /** Maximum times to show the popup before giving up */
  private static readonly MAX_APPEARANCES = 2;

  /** User's permission response (null = not yet responded) */
  speechAllowedByUser: boolean | null = null;

  /** Disable the permission popup entirely */
  disablePopup = false;

  /** Force showing popup everywhere (not just mobile/Safari) */
  allowPopupEverywhere = false;

  /** Scheduled speak to execute after permission granted */
  scheduledSpeak: ScheduledSpeak | null = null;

  /** Default options applied to every showPopup call (user-configurable) */
  defaultOptions: PermissionPopupOptions = {};

  constructor(config: PermissionPopupConfig = {}) {
    this.config = config;
  }

  /**
   * Check if speech is allowed and show popup if needed
   *
   * @param options - Popup options
   * @param platformInfo - Platform detection info
   * @returns true if speech is allowed, false if popup was shown or denied
   */
  checkSpeechAllowed(
    options: PermissionPopupOptions = {},
    platformInfo: {
      isIOS: boolean;
      isAndroid: boolean;
      isSafari: boolean;
      isFallbackMode: boolean;
      isForcedFallback: boolean;
      clickEventDetected: boolean;
      speechSynthesisNotAllowedError?: boolean;
    }
  ): boolean {
    // If user explicitly denied, return false
    if (this.speechAllowedByUser === false) {
      return false;
    }

    // If popup is disabled, allow
    if (this.disablePopup) {
      return true;
    }

    // Determine if we should show popup
    const onMobile = platformInfo.isAndroid || platformInfo.isIOS;
    const onSafariFallback =
      platformInfo.isSafari && (platformInfo.isFallbackMode || platformInfo.isForcedFallback);
    const shouldShowPopup =
      this.allowPopupEverywhere ||
      onMobile ||
      onSafariFallback ||
      platformInfo.speechSynthesisNotAllowedError === true;

    // If conditions met and no click event detected, show popup
    if (shouldShowPopup && !platformInfo.clickEventDetected) {
      // Popup already showing
      if (this.popupElement) {
        return false;
      }

      // Limit popup appearances
      this.appearanceCount++;
      if (this.appearanceCount > PermissionPopup.MAX_APPEARANCES) {
        console.log('ResponsiveVoice: Speech not allowed by user');
        return false;
      }

      this.showPopup(options);
      return false;
    }

    return true;
  }

  /**
   * Show the permission popup
   */
  showPopup(options: PermissionPopupOptions = {}): void {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') {
      return;
    }

    // Don't show if already showing
    if (this.popupElement) {
      return;
    }

    // Merge defaults with per-call options
    const merged = { ...this.defaultOptions, ...options };
    const prefix = merged.classPrefix ?? 'rv';
    const position = merged.position ?? 'bottom';
    const container = merged.appendTo ?? document.body;

    // Custom renderer — full user control
    if (merged.renderPopup) {
      this.popupElement = merged.renderPopup(
        () => this.handleResponse(true),
        () => this.handleResponse(false)
      );
      container.appendChild(this.popupElement);
      return;
    }

    // Inject styles (with class prefix and position)
    this.injectStyles(prefix, position);

    // Create popup element
    this.popupElement = document.createElement('div');
    this.popupElement.classList.add(`${prefix}Notification`);

    const origin =
      merged.urlOverride ??
      (typeof window !== 'undefined' ? window.location.hostname : 'This site');
    const action = merged.textOverride ?? 'wants to play speech';

    // Create popup content
    const textRow = document.createElement('div');
    textRow.classList.add(`${prefix}TextRow`);
    textRow.innerHTML = `<strong>${this.escapeHtml(origin)}</strong> ${this.escapeHtml(action)}`;

    const buttonRow = document.createElement('div');
    buttonRow.classList.add(`${prefix}ButtonRow`);

    const denyButton = document.createElement('div');
    denyButton.classList.add(`${prefix}Button`, `${prefix}ButtonDeny`);
    denyButton.textContent = merged.denyLabel ?? 'DENY';
    denyButton.onclick = () => this.handleResponse(false);

    const allowButton = document.createElement('div');
    allowButton.classList.add(`${prefix}Button`, `${prefix}ButtonAllow`);
    allowButton.textContent = merged.allowLabel ?? 'ALLOW';
    allowButton.onclick = () => this.handleResponse(true);

    buttonRow.appendChild(denyButton);
    buttonRow.appendChild(allowButton);

    this.popupElement.appendChild(textRow);
    this.popupElement.appendChild(buttonRow);

    container.appendChild(this.popupElement);
  }

  /**
   * Handle user response (allow/deny)
   */
  handleResponse(allowed: boolean): void {
    this.hidePopup();
    this.speechAllowedByUser = allowed;

    if (allowed) {
      // Trigger click event for iOS/Android unlock
      this.config.onClickEvent?.();
    }

    // Notify callback
    this.config.onResponse?.(allowed);
  }

  /**
   * Hide and remove the popup
   */
  hidePopup(): void {
    if (this.popupElement?.parentNode) {
      this.popupElement.parentNode.removeChild(this.popupElement);
      this.popupElement = null;
    }
  }

  /**
   * Inject CSS styles into the document
   */
  private injectStyles(prefix = 'rv', position: 'top' | 'bottom' = 'bottom'): void {
    if (typeof document === 'undefined') {
      return;
    }

    const styleId = prefix === 'rv' ? POPUP_STYLE_ID : `${prefix}-permission-popup-styles`;

    // Check if already injected
    if (document.getElementById(styleId)) {
      return;
    }

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent =
      prefix === 'rv' && position === 'bottom'
        ? POPUP_STYLES
        : generatePopupStyles(prefix, position);
    document.head.appendChild(this.styleElement);
  }

  /**
   * Remove injected styles
   */
  removeStyles(): void {
    if (this.styleElement?.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if popup is currently showing
   */
  isShowing(): boolean {
    return this.popupElement !== null;
  }

  /**
   * Reset popup state (for testing)
   */
  reset(): void {
    this.hidePopup();
    this.removeStyles();
    this.speechAllowedByUser = null;
    this.appearanceCount = 0;
    this.scheduledSpeak = null;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.reset();
  }
}

/**
 * Create a new PermissionPopup instance
 */
export function createPermissionPopup(config?: PermissionPopupConfig): PermissionPopup {
  return new PermissionPopup(config);
}
