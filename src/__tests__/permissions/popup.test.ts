/**
 * Tests for PermissionPopup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPermissionPopup, PermissionPopup, POPUP_STYLE_ID } from '../../permissions';

describe('PermissionPopup', () => {
  let popup: PermissionPopup;
  let mockOnResponse: ReturnType<typeof vi.fn>;
  let mockOnClickEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnResponse = vi.fn();
    mockOnClickEvent = vi.fn();
    popup = new PermissionPopup({
      onResponse: mockOnResponse,
      onClickEvent: mockOnClickEvent,
    });
  });

  afterEach(() => {
    popup.dispose();
    // Clean up any DOM elements
    const styleEl = document.getElementById(POPUP_STYLE_ID);
    if (styleEl) {
      styleEl.remove();
    }
    const notificationEl = document.querySelector('.rvNotification');
    if (notificationEl) {
      notificationEl.remove();
    }
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const p = new PermissionPopup();
      expect(p.speechAllowedByUser).toBeNull();
      expect(p.disablePopup).toBe(false);
      expect(p.allowPopupEverywhere).toBe(false);
      expect(p.scheduledSpeak).toBeNull();
      p.dispose();
    });

    it('should accept config callbacks', () => {
      expect(popup).toBeInstanceOf(PermissionPopup);
    });
  });

  describe('createPermissionPopup factory', () => {
    it('should create a new popup instance', () => {
      const p = createPermissionPopup();
      expect(p).toBeInstanceOf(PermissionPopup);
      p.dispose();
    });

    it('should accept config', () => {
      const callback = vi.fn();
      const p = createPermissionPopup({ onResponse: callback });
      expect(p).toBeInstanceOf(PermissionPopup);
      p.dispose();
    });
  });

  describe('checkSpeechAllowed', () => {
    const basePlatformInfo = {
      isIOS: false,
      isAndroid: false,
      isSafari: false,
      isFallbackMode: false,
      isForcedFallback: false,
      clickEventDetected: false,
    };

    it('should return true when popup is disabled', () => {
      popup.disablePopup = true;
      const result = popup.checkSpeechAllowed({}, { ...basePlatformInfo, isIOS: true });
      expect(result).toBe(true);
    });

    it('should return false when user has denied', () => {
      popup.speechAllowedByUser = false;
      const result = popup.checkSpeechAllowed({}, basePlatformInfo);
      expect(result).toBe(false);
    });

    it('should return true on desktop with click detected', () => {
      const result = popup.checkSpeechAllowed(
        {},
        { ...basePlatformInfo, clickEventDetected: true }
      );
      expect(result).toBe(true);
    });

    it('should show popup on iOS without click event', () => {
      const result = popup.checkSpeechAllowed({}, { ...basePlatformInfo, isIOS: true });
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(true);
    });

    it('should show popup on Android without click event', () => {
      const result = popup.checkSpeechAllowed({}, { ...basePlatformInfo, isAndroid: true });
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(true);
    });

    it('should show popup on Safari with fallback mode', () => {
      const result = popup.checkSpeechAllowed(
        {},
        { ...basePlatformInfo, isSafari: true, isFallbackMode: true }
      );
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(true);
    });

    it('should show popup on Safari with forced fallback', () => {
      const result = popup.checkSpeechAllowed(
        {},
        { ...basePlatformInfo, isSafari: true, isForcedFallback: true }
      );
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(true);
    });

    it('should show popup when allowPopupEverywhere is true', () => {
      popup.allowPopupEverywhere = true;
      const result = popup.checkSpeechAllowed({}, basePlatformInfo);
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(true);
    });

    it('should not show popup on iOS when click event detected', () => {
      const result = popup.checkSpeechAllowed(
        {},
        { ...basePlatformInfo, isIOS: true, clickEventDetected: true }
      );
      expect(result).toBe(true);
      expect(popup.isShowing()).toBe(false);
    });

    it('should limit popup appearances to 2', () => {
      // First appearance
      popup.checkSpeechAllowed({}, { ...basePlatformInfo, isIOS: true });
      expect(popup.isShowing()).toBe(true);
      popup.hidePopup();

      // Second appearance
      popup.checkSpeechAllowed({}, { ...basePlatformInfo, isIOS: true });
      expect(popup.isShowing()).toBe(true);
      popup.hidePopup();

      // Third attempt - should not show
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = popup.checkSpeechAllowed({}, { ...basePlatformInfo, isIOS: true });
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(false);
      expect(consoleLog).toHaveBeenCalledWith('ResponsiveVoice: Speech not allowed by user');
      consoleLog.mockRestore();
    });

    it('should show popup when speechSynthesisNotAllowedError is true', () => {
      const result = popup.checkSpeechAllowed(
        {},
        { ...basePlatformInfo, speechSynthesisNotAllowedError: true }
      );
      expect(result).toBe(false);
      expect(popup.isShowing()).toBe(true);
    });
  });

  describe('showPopup', () => {
    it('should create popup element in DOM', () => {
      popup.showPopup();
      const el = document.querySelector('.rvNotification');
      expect(el).not.toBeNull();
    });

    it('should inject styles', () => {
      popup.showPopup();
      const styleEl = document.getElementById(POPUP_STYLE_ID);
      expect(styleEl).not.toBeNull();
    });

    it('should display hostname by default', () => {
      popup.showPopup();
      const el = document.querySelector('.rvNotification');
      expect(el?.textContent).toContain('localhost');
    });

    it('should use urlOverride when provided', () => {
      popup.showPopup({ urlOverride: 'My App' });
      const el = document.querySelector('.rvNotification');
      expect(el?.textContent).toContain('My App');
    });

    it('should use textOverride when provided', () => {
      popup.showPopup({ textOverride: 'needs your permission' });
      const el = document.querySelector('.rvNotification');
      expect(el?.textContent).toContain('needs your permission');
    });

    it('should have allow and deny buttons', () => {
      popup.showPopup();
      const allowBtn = document.querySelector('.rvButtonAllow');
      const denyBtn = document.querySelector('.rvButtonDeny');
      expect(allowBtn?.textContent).toBe('ALLOW');
      expect(denyBtn?.textContent).toBe('DENY');
    });

    it('should not create duplicate popups', () => {
      popup.showPopup();
      popup.showPopup();
      const els = document.querySelectorAll('.rvNotification');
      expect(els.length).toBe(1);
    });
  });

  describe('handleResponse', () => {
    it('should set speechAllowedByUser to true when allowed', () => {
      popup.handleResponse(true);
      expect(popup.speechAllowedByUser).toBe(true);
    });

    it('should set speechAllowedByUser to false when denied', () => {
      popup.handleResponse(false);
      expect(popup.speechAllowedByUser).toBe(false);
    });

    it('should call onResponse callback', () => {
      popup.handleResponse(true);
      expect(mockOnResponse).toHaveBeenCalledWith(true);

      popup.handleResponse(false);
      expect(mockOnResponse).toHaveBeenCalledWith(false);
    });

    it('should call onClickEvent when allowed', () => {
      popup.handleResponse(true);
      expect(mockOnClickEvent).toHaveBeenCalled();
    });

    it('should not call onClickEvent when denied', () => {
      popup.handleResponse(false);
      expect(mockOnClickEvent).not.toHaveBeenCalled();
    });

    it('should hide popup', () => {
      popup.showPopup();
      expect(popup.isShowing()).toBe(true);
      popup.handleResponse(true);
      expect(popup.isShowing()).toBe(false);
    });
  });

  describe('hidePopup', () => {
    it('should remove popup from DOM', () => {
      popup.showPopup();
      expect(document.querySelector('.rvNotification')).not.toBeNull();
      popup.hidePopup();
      expect(document.querySelector('.rvNotification')).toBeNull();
    });

    it('should handle being called when no popup showing', () => {
      expect(() => popup.hidePopup()).not.toThrow();
    });
  });

  describe('isShowing', () => {
    it('should return false initially', () => {
      expect(popup.isShowing()).toBe(false);
    });

    it('should return true when popup is showing', () => {
      popup.showPopup();
      expect(popup.isShowing()).toBe(true);
    });

    it('should return false after hiding', () => {
      popup.showPopup();
      popup.hidePopup();
      expect(popup.isShowing()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      popup.speechAllowedByUser = true;
      popup.scheduledSpeak = { text: 'test' };
      popup.showPopup();

      popup.reset();

      expect(popup.speechAllowedByUser).toBeNull();
      expect(popup.scheduledSpeak).toBeNull();
      expect(popup.isShowing()).toBe(false);
    });
  });

  describe('button click behavior', () => {
    it('should call handleResponse(true) when allow is clicked', () => {
      popup.showPopup();
      const allowBtn = document.querySelector('.rvButtonAllow') as HTMLElement;
      allowBtn.click();

      expect(popup.speechAllowedByUser).toBe(true);
      expect(mockOnResponse).toHaveBeenCalledWith(true);
      expect(mockOnClickEvent).toHaveBeenCalled();
    });

    it('should call handleResponse(false) when deny is clicked', () => {
      popup.showPopup();
      const denyBtn = document.querySelector('.rvButtonDeny') as HTMLElement;
      denyBtn.click();

      expect(popup.speechAllowedByUser).toBe(false);
      expect(mockOnResponse).toHaveBeenCalledWith(false);
    });
  });

  describe('scheduledSpeak', () => {
    it('should store scheduled speak data', () => {
      const scheduled = {
        text: 'Hello world',
        voiceName: 'UK English Female',
        parameters: { volume: 0.8 },
      };
      popup.scheduledSpeak = scheduled;
      expect(popup.scheduledSpeak).toEqual(scheduled);
    });
  });

  describe('customization', () => {
    it('should use custom button labels', () => {
      popup.showPopup({ allowLabel: 'Yes', denyLabel: 'No' });
      const allowBtn = document.querySelector('.rvButtonAllow');
      const denyBtn = document.querySelector('.rvButtonDeny');
      expect(allowBtn?.textContent).toBe('Yes');
      expect(denyBtn?.textContent).toBe('No');
    });

    it('should use defaultOptions as base', () => {
      popup.defaultOptions = { allowLabel: 'OK', denyLabel: 'Cancel' };
      popup.showPopup();
      const allowBtn = document.querySelector('.rvButtonAllow');
      const denyBtn = document.querySelector('.rvButtonDeny');
      expect(allowBtn?.textContent).toBe('OK');
      expect(denyBtn?.textContent).toBe('Cancel');
    });

    it('should let per-call options override defaultOptions', () => {
      popup.defaultOptions = { allowLabel: 'OK' };
      popup.showPopup({ allowLabel: 'Sure' });
      const allowBtn = document.querySelector('.rvButtonAllow');
      expect(allowBtn?.textContent).toBe('Sure');
    });

    it('should append to custom container', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      popup.showPopup({ appendTo: container });
      expect(container.querySelector('.rvNotification')).not.toBeNull();
      expect(document.body.children[document.body.children.length - 1]).toBe(container);
      container.remove();
    });

    it('should use custom class prefix', () => {
      popup.showPopup({ classPrefix: 'myapp' });
      expect(document.querySelector('.myappNotification')).not.toBeNull();
      expect(document.querySelector('.myappButtonAllow')).not.toBeNull();
      expect(document.querySelector('.myappButtonDeny')).not.toBeNull();
      expect(document.querySelector('.myappTextRow')).not.toBeNull();
      expect(document.querySelector('.myappButtonRow')).not.toBeNull();
      // Should inject prefixed styles
      const styleEl = document.getElementById('myapp-permission-popup-styles');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.textContent).toContain('.myappNotification');
      styleEl?.remove();
    });

    it('should support top position', () => {
      popup.showPopup({ position: 'top' });
      const styleEl = document.getElementById(POPUP_STYLE_ID);
      expect(styleEl?.textContent).toContain('top: 0;');
      expect(styleEl?.textContent).not.toContain('bottom: 0;');
    });

    it('should use custom renderer', () => {
      const renderPopup = (onAllow: () => void, onDeny: () => void) => {
        const el = document.createElement('div');
        el.className = 'custom-popup';
        const allowBtn = document.createElement('button');
        allowBtn.className = 'custom-allow';
        allowBtn.onclick = onAllow;
        const denyBtn = document.createElement('button');
        denyBtn.className = 'custom-deny';
        denyBtn.onclick = onDeny;
        el.appendChild(allowBtn);
        el.appendChild(denyBtn);
        return el;
      };

      popup.showPopup({ renderPopup });
      expect(document.querySelector('.custom-popup')).not.toBeNull();
      expect(popup.isShowing()).toBe(true);

      // Clicking allow should trigger handleResponse
      const allowBtn = document.querySelector('.custom-allow') as HTMLElement;
      allowBtn.click();
      expect(popup.speechAllowedByUser).toBe(true);
      expect(mockOnResponse).toHaveBeenCalledWith(true);
      expect(popup.isShowing()).toBe(false);
    });

    it('should use custom renderer with deny', () => {
      const renderPopup = (_onAllow: () => void, onDeny: () => void) => {
        const el = document.createElement('div');
        el.className = 'custom-popup';
        const denyBtn = document.createElement('button');
        denyBtn.className = 'custom-deny';
        denyBtn.onclick = onDeny;
        el.appendChild(denyBtn);
        return el;
      };

      popup.showPopup({ renderPopup });
      const denyBtn = document.querySelector('.custom-deny') as HTMLElement;
      denyBtn.click();
      expect(popup.speechAllowedByUser).toBe(false);
      expect(mockOnResponse).toHaveBeenCalledWith(false);
    });

    it('should append custom renderer to custom container', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const renderPopup = () => {
        const el = document.createElement('div');
        el.className = 'custom-popup';
        return el;
      };

      popup.showPopup({ renderPopup, appendTo: container });
      expect(container.querySelector('.custom-popup')).not.toBeNull();
      container.remove();
    });
  });
});
