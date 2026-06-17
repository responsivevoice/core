/**
 * Permission Management Module
 *
 * Handles user interaction detection, iOS audio context unlock,
 * and permission popup for browser-based TTS.
 */

export {
  needsiOSUnlock,
  supportsSpeechSynthesis,
  unlockiOSAudio,
} from './ios-unlock';
export {
  type PermissionConfig,
  PermissionManager,
  PermissionManagerAbortedError,
  type PermissionManagerAbortReason,
} from './manager';
export {
  createPermissionPopup,
  PermissionPopup,
  type PermissionPopupOptions,
} from './popup';
export { POPUP_STYLE_ID } from './popup-styles';
