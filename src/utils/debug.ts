/**
 * Debug Utilities
 *
 * Provides debug logging functionality for ResponsiveVoice.
 */

/** Global debug flag */
let debugEnabled = false;

/**
 * Enable or disable debug logging
 * @param enabled - Whether to enable debug logging
 */
export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

/**
 * Get the current debug state
 * @returns Whether debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/**
 * Log a debug message (only if debug is enabled)
 * @param message - The message to log
 * @param args - Additional arguments to log
 */
export function debugLog(message: string, ...args: unknown[]): void {
  if (debugEnabled) {
    console.log(`[ResponsiveVoice] ${message}`, ...args);
  }
}

/**
 * Reset debug state (for testing)
 */
export function resetDebug(): void {
  debugEnabled = false;
}
