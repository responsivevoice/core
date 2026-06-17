/**
 * iOS Audio Context Unlock
 *
 * Modern browsers (especially iOS Safari) require user interaction before audio can play.
 * On iOS, playing a silent utterance after user interaction "unlocks" the audio context.
 */

/**
 * Error thrown when iOS audio unlock fails
 */
export class IOSUnlockError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error | SpeechSynthesisErrorEvent
  ) {
    super(message);
    this.name = 'IOSUnlockError';
  }
}

/**
 * Check if the browser supports Web Speech API
 * @returns true if speechSynthesis is available
 */
export function supportsSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Unlock iOS audio by playing a silent utterance
 *
 * On iOS Safari, the speechSynthesis API is blocked until the user
 * interacts with the page. Playing a silent utterance after user
 * interaction unlocks the audio context for subsequent speech.
 *
 * @throws IOSUnlockError if speech synthesis is not supported or unlock fails
 * @returns Promise that resolves when audio is unlocked
 */
export function unlockiOSAudio(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!supportsSpeechSynthesis()) {
      reject(new IOSUnlockError('Speech synthesis not supported in this browser'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    utterance.rate = 1;
    utterance.pitch = 1;

    // Timeout to prevent hanging indefinitely
    const timeoutId = setTimeout(() => {
      // Clean up handlers
      utterance.onend = null;
      utterance.onerror = null;
      reject(new IOSUnlockError('iOS audio unlock timed out'));
    }, 5000);

    utterance.onend = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      clearTimeout(timeoutId);
      // "canceled" error can occur if we call cancel() or another speak() starts
      // "not-allowed" means autoplay policy blocked it
      // "interrupted" can occur on some browsers
      // Some browsers fire error for empty utterances but unlock still works
      if (
        event.error === 'canceled' ||
        event.error === 'interrupted' ||
        event.error === 'not-allowed'
      ) {
        // These are expected in some scenarios, treat as partial success
        resolve();
      } else {
        reject(new IOSUnlockError(`iOS audio unlock failed: ${event.error}`, event));
      }
    };

    try {
      // Cancel any pending speech first
      window.speechSynthesis.cancel();
      // Speak the silent utterance
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(
        new IOSUnlockError(
          'Failed to initiate iOS audio unlock',
          error instanceof Error ? error : new Error(String(error))
        )
      );
    }
  });
}

/**
 * Check if iOS audio unlock is needed
 *
 * @param isiOS - Whether the current platform is iOS
 * @param isUnlocked - Whether audio has already been unlocked
 * @returns true if iOS unlock should be attempted
 */
export function needsiOSUnlock(isiOS: boolean, isUnlocked: boolean): boolean {
  return isiOS && !isUnlocked && supportsSpeechSynthesis();
}
