/**
 * Default configuration values for ResponsiveVoice
 */

/**
 * Default API base URL
 */
export const DEFAULT_API_BASE_URL = 'https://texttospeech.responsivevoice.org/v2';

/**
 * Default timeout in milliseconds
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Default retry attempts
 */
export const DEFAULT_RETRY_ATTEMPTS = 3;

/**
 * Default voice name if none specified
 */
export const DEFAULT_VOICE = 'UK English Female';

/**
 * Default speech parameters
 */
export const DEFAULT_SPEECH_PARAMS = {
  pitch: 1,
  rate: 1,
  volume: 1,
} as const;

/**
 * Audio pool size for fallback engine
 */
export const AUDIO_POOL_SIZE = 5;

/**
 * Audio pool size for iOS (smaller to conserve resources)
 */
export const AUDIO_POOL_SIZE_IOS = 2;

/**
 * Pause timeout in milliseconds (after which speech is cancelled)
 */
export const PAUSE_TIMEOUT_MS = 60000;

/**
 * Events the PermissionManager listens for to detect the first user gesture.
 *
 * Restricted to `click` and `keydown` so the capture-phase document listener
 * and a button's bubble-phase onclick share the same event task — required
 * for the iOS gesture-credit chain. Adding `touchstart`/`mousedown` breaks
 * this: each fires as its own task, running the unlock pipeline before the
 * synchronous `speak()` call has a chance to suppress the silent utterance.
 */
export const USER_INTERACTION_EVENTS = ['click', 'keydown'] as const;
