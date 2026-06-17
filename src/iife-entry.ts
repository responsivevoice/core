/**
 * IIFE Entry Point — Legacy-compatible script tag usage.
 *
 * Auto-creates a ResponsiveVoice instance and exposes it as `window.responsiveVoice`.
 * Users call `responsiveVoice.init({ apiKey })` to configure, then speak normally.
 * Speak calls before init() completes are queued and replayed automatically.
 *
 * @example
 * ```html
 * <script src="responsivevoice.js"></script>
 * <script>
 *   responsiveVoice.init({ apiKey: 'your-api-key' });
 *   responsiveVoice.speak('Hello world');
 * </script>
 * ```
 */

import { setGlobalInstance } from './globals';
import { ResponsiveVoice } from './responsivevoice';

// Auto-create instance (zero-config — API key provided via init())
const instance = new ResponsiveVoice();

// Expose instance as global (legacy behavior: window.responsiveVoice IS the instance)
if (typeof window !== 'undefined') {
  // biome-ignore lint/suspicious/noExplicitAny: global window assignment for legacy compatibility
  (window as Record<string, any>).responsiveVoice = instance;
  setGlobalInstance(instance);
}

export default instance;
