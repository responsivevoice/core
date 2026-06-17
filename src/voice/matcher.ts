/**
 * Voice Name Matcher
 *
 * Implements 3 matching strategies to find browser voices:
 * 1. Exact Match - Direct name comparison
 * 2. Whitespace Normalized - Handles Chrome's Unicode spaces (U+00A0)
 * 3. Parenthetical Stripped - Handles Apple's "(Enhanced)" suffix
 */

import type { MatchResult } from './types';

/**
 * Unicode non-breaking space character used by Chrome for Asian language voices.
 */
const UNICODE_WHITESPACE = '\u00A0';

/**
 * Regex to match parenthetical suffixes like "(Enhanced)" or "(Premium)".
 */
const PARENTHETICAL_REGEX = / *\([^)]*\) */g;

/**
 * Regex to match all types of whitespace including Unicode spaces.
 */
const WHITESPACE_REGEX = new RegExp(`\\s+|${UNICODE_WHITESPACE}`, 'g');

/**
 * VoiceMatcher provides methods to find browser voices using multiple
 * matching strategies to handle platform-specific naming differences.
 */
export class VoiceMatcher {
  /**
   * Finds a browser voice matching the target name.
   * Tries multiple matching strategies in order of specificity.
   *
   * @param targetName - The voice name to search for
   * @param browserVoices - Array of available browser voices
   * @returns The matched voice or null if not found
   */
  findMatch(
    targetName: string,
    browserVoices: SpeechSynthesisVoice[]
  ): SpeechSynthesisVoice | null {
    const result = this.findMatchWithStrategy(targetName, browserVoices);
    return result.voice;
  }

  /**
   * Finds a browser voice matching the target name and returns
   * information about which strategy produced the match.
   *
   * @param targetName - The voice name to search for
   * @param browserVoices - Array of available browser voices
   * @returns Match result with voice and strategy information
   */
  findMatchWithStrategy(targetName: string, browserVoices: SpeechSynthesisVoice[]): MatchResult {
    if (!browserVoices || browserVoices.length === 0) {
      return { voice: null, strategy: null };
    }

    // Strategy 1: Exact match
    const exactMatch = this.exactMatch(targetName, browserVoices);
    if (exactMatch) {
      return { voice: exactMatch, strategy: 'exact' };
    }

    // Pre-normalize target for subsequent strategies
    const normalizedTarget = this.normalizeWhitespace(targetName);

    // Strategy 2: Whitespace normalized match
    const whitespaceMatch = this.whitespaceNormalizedMatch(normalizedTarget, browserVoices);
    if (whitespaceMatch) {
      return { voice: whitespaceMatch, strategy: 'whitespace' };
    }

    // Strategy 3: Parenthetical stripped match
    const parentheticalMatch = this.parentheticalStrippedMatch(normalizedTarget, browserVoices);
    if (parentheticalMatch) {
      return { voice: parentheticalMatch, strategy: 'parenthetical' };
    }

    // Strategy 4: Partial case-insensitive match
    const partialMatch = this.partialMatch(targetName, browserVoices);
    if (partialMatch) {
      return { voice: partialMatch, strategy: 'partial' };
    }

    return { voice: null, strategy: null };
  }

  /**
   * Strategy 1: Exact name match using localeCompare.
   *
   * @param targetName - Name to match
   * @param voices - Browser voices to search
   * @returns Matched voice or null
   */
  exactMatch(targetName: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    for (const voice of voices) {
      if (voice.name.localeCompare(targetName) === 0) {
        return voice;
      }
    }
    return null;
  }

  /**
   * Strategy 2: Whitespace normalized match.
   * Handles Chrome's Unicode space characters in Asian language voice names.
   *
   * @param normalizedTarget - Pre-normalized target name
   * @param voices - Browser voices to search
   * @returns Matched voice or null
   */
  whitespaceNormalizedMatch(
    normalizedTarget: string,
    voices: SpeechSynthesisVoice[]
  ): SpeechSynthesisVoice | null {
    for (const voice of voices) {
      const normalizedVoiceName = this.normalizeWhitespace(voice.name);
      if (normalizedVoiceName.localeCompare(normalizedTarget) === 0) {
        return voice;
      }
    }
    return null;
  }

  /**
   * Strategy 3: Parenthetical stripped match.
   * Handles Apple Safari's "(Enhanced)" and "(Premium)" voice variants.
   *
   * @param normalizedTarget - Pre-normalized target name
   * @param voices - Browser voices to search
   * @returns Matched voice or null
   */
  parentheticalStrippedMatch(
    normalizedTarget: string,
    voices: SpeechSynthesisVoice[]
  ): SpeechSynthesisVoice | null {
    for (const voice of voices) {
      const strippedVoiceName = this.stripParenthetical(this.normalizeWhitespace(voice.name));
      if (strippedVoiceName.localeCompare(normalizedTarget) === 0) {
        return voice;
      }
    }
    return null;
  }

  /**
   * Strategy 4: Partial case-insensitive name match.
   * Finds a browser voice whose name contains the target name as a substring.
   * Handles cases where voice names differ slightly across platforms.
   *
   * @param targetName - Name to match (case-insensitive)
   * @param voices - Browser voices to search
   * @returns Matched voice or null
   */
  partialMatch(targetName: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const lowerTarget = targetName.toLowerCase();
    for (const voice of voices) {
      if (voice.name.toLowerCase().includes(lowerTarget)) {
        return voice;
      }
    }
    return null;
  }

  /**
   * Normalizes whitespace by removing all regular and Unicode whitespace.
   *
   * @param str - String to normalize
   * @returns String with all whitespace removed
   */
  normalizeWhitespace(str: string): string {
    return str.replace(WHITESPACE_REGEX, '');
  }

  /**
   * Strips parenthetical suffixes from voice names.
   * Example: `"Samantha (Enhanced)"` becomes `"Samantha"`.
   *
   * @param str - String to process
   * @returns String with parenthetical content removed
   */
  stripParenthetical(str: string): string {
    return str.replace(PARENTHETICAL_REGEX, '');
  }
}

/**
 * Shared instance for convenience.
 */
let matcherInstance: VoiceMatcher | null = null;

/**
 * Gets the shared VoiceMatcher instance.
 *
 * @returns The shared VoiceMatcher
 */
export function getVoiceMatcher(): VoiceMatcher {
  if (!matcherInstance) {
    matcherInstance = new VoiceMatcher();
  }
  return matcherInstance;
}

/**
 * Resets the shared instance (for testing).
 */
export function resetVoiceMatcher(): void {
  matcherInstance = null;
}
