/**
 * Voice Resolver
 *
 * Implements voice fallback resolution: 5-strategy matching across each
 * voice's voiceIDs chain. For each ResponsiveVoice, walks the chain to
 * find the first available voice (either native browser or fallback HTTP).
 */

import type { SystemVoice, TTSService, Voice, VoiceQuery } from '@responsivevoice/types';
import type { PlatformInfo } from '../platform';
import { getPlatformInfo } from '../platform';
import { debugLog } from '../utils';
import { cachedVoicesToSpeechVoices, getIOSVoiceCache } from './cache';
import { getVoiceMatcher, type VoiceMatcher } from './matcher';
import type {
  BrowserVoiceProvider,
  FallbackVoiceConfig,
  MatchingStrategy,
  ResolvedVoice,
  VoiceResolverConfig,
} from './types';

/**
 * Default timeout for waiting for browser voices to load.
 * Chrome loads voices async from Google servers, Firefox/Safari load sync.
 * 2 seconds is enough for most network conditions.
 */
const DEFAULT_VOICE_TIMEOUT_MS = 2000;

/**
 * Score a browser voice against the requested language. Higher is better.
 *
 * - `localService === false`: +50
 * - `default === true`: +10
 * - `lang === requested`: +5
 *
 * @internal
 */
function scoreNativeVoice(voice: SpeechSynthesisVoice, lang: string): number {
  let score = 0;
  if (voice.localService === false) score += 50;
  if (voice.default) score += 10;
  if (voice.lang === lang) score += 5;
  return score;
}

/**
 * Default browser voice provider using window.speechSynthesis.
 *
 * Cross-browser voice loading behavior:
 * - Chrome: Loads voices asynchronously (fetches from Google servers), requires voiceschanged event
 * - Firefox: Loads voices synchronously, voiceschanged may not fire
 * - Safari: Loads voices synchronously, voiceschanged may not fire
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event
 * @see https://caniuse.com/speech-synthesis
 * @see https://dev.to/jankapunkt/cross-browser-speech-synthesis-the-hard-way-and-the-easy-way-353
 */
class DefaultBrowserVoiceProvider implements BrowserVoiceProvider {
  getVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return [];
    }
    return window.speechSynthesis.getVoices();
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
  }

  /**
   * Wait for browser voices to load using Promise.race pattern.
   *
   * This handles cross-browser differences:
   * - Chrome: voiceschanged event fires when voices are ready
   * - Firefox/Safari: Voices load synchronously, timeout wins the race
   *
   * An empty voice list is valid (e.g., Chrome on Linux without flags).
   *
   * @param timeoutMs - Maximum time to wait (default: 2000ms)
   * @returns Promise resolving to available voices (may be empty)
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices
   * @see https://blog.monotonous.org/2021/11/15/speechSynthesis-getVoices/
   */
  async waitForVoices(
    timeoutMs: number = DEFAULT_VOICE_TIMEOUT_MS
  ): Promise<SpeechSynthesisVoice[]> {
    if (!this.isAvailable()) {
      return [];
    }

    // Check if voices are already loaded (Firefox/Safari load synchronously)
    const voices = this.getVoices();
    if (voices.length > 0) {
      return voices;
    }

    // Check if addEventListener is available (may not be in test environments)
    const synth = window.speechSynthesis;
    const hasEventListener = typeof synth.addEventListener === 'function';

    if (!hasEventListener) {
      // No event support - just return current voices (test environment or old browser)
      return voices;
    }

    // Wait for voiceschanged event (Chrome) or timeout (Firefox/Safari fallback)
    const voicesChanged = new Promise<void>((resolve) => {
      synth.addEventListener('voiceschanged', () => resolve(), { once: true });
    });

    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    });

    await Promise.race([voicesChanged, timeout]);

    return this.getVoices();
  }
}

/**
 * VoiceResolver resolves ResponsiveVoice names to available voices.
 *
 * The resolver walks through each voice's voiceIDs array (up to 14 entries)
 * in priority order, checking:
 * 1. If the system voice is a native voice, try to match it in the browser
 * 2. If the system voice is a fallback voice, return fallback configuration
 *
 * The first match wins.
 */
export class VoiceResolver {
  private responsiveVoices: Map<string, Voice> = new Map();
  private systemVoices: Map<number, SystemVoice> = new Map();
  private browserVoices: SpeechSynthesisVoice[] = [];
  private matcher: VoiceMatcher;
  private config: VoiceResolverConfig;
  private browserVoiceProvider: BrowserVoiceProvider;
  private platformInfo: PlatformInfo;

  /**
   * Creates a new VoiceResolver.
   *
   * @param config - Resolver configuration options
   * @param browserVoiceProvider - Optional browser voice provider for testing
   */
  constructor(config: VoiceResolverConfig = {}, browserVoiceProvider?: BrowserVoiceProvider) {
    this.config = {
      forceFallback: false,
      useIOSCache: true,
      ...config,
    };
    this.matcher = getVoiceMatcher();
    this.browserVoiceProvider = browserVoiceProvider ?? new DefaultBrowserVoiceProvider();
    this.platformInfo = getPlatformInfo();
  }

  /** Toggle the `forceFallback` bias for subsequent {@link resolve} calls. */
  setForceFallback(force: boolean): void {
    this.config.forceFallback = force;
  }

  /**
   * Sets the voice data from the API.
   *
   * @param voices - Array of ResponsiveVoice definitions
   * @param systemVoices - Array of system voice mappings
   */
  setVoiceData(voices: Voice[], systemVoices: SystemVoice[]): void {
    this.responsiveVoices.clear();
    for (const voice of voices) {
      this.responsiveVoices.set(voice.name, voice);
    }

    this.systemVoices.clear();
    for (const voice of systemVoices) {
      this.systemVoices.set(voice.id, voice);
    }
  }

  /**
   * Refreshes the list of browser voices from speechSynthesis (sync).
   * Should be called when voices become available (onvoiceschanged).
   */
  refreshBrowserVoices(): void {
    let voices = this.browserVoiceProvider.getVoices();

    // Use iOS cache if browser returns empty voices on iOS
    if (voices.length === 0 && this.config.useIOSCache && this.platformInfo.isIOS) {
      const cachedVoices = getIOSVoiceCache(this.platformInfo);
      voices = cachedVoicesToSpeechVoices(cachedVoices);
    }

    this.browserVoices = voices;
  }

  /**
   * Waits for browser voices to load and refreshes the internal list.
   *
   * This handles cross-browser voice loading differences:
   * - Chrome: Loads voices async from Google servers, requires voiceschanged event
   * - Firefox/Safari: Load voices synchronously, return immediately
   *
   * @param timeoutMs - Maximum time to wait for voices (default: 2000ms)
   * @returns Promise resolving when voices are loaded (may be empty on some platforms)
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event
   * @see https://caniuse.com/speech-synthesis
   */
  async waitForBrowserVoices(timeoutMs?: number): Promise<void> {
    const voices = await this.browserVoiceProvider.waitForVoices(timeoutMs);

    // Use iOS cache if browser returns empty voices on iOS
    if (voices.length === 0 && this.config.useIOSCache && this.platformInfo.isIOS) {
      const cachedVoices = getIOSVoiceCache(this.platformInfo);
      this.browserVoices = cachedVoicesToSpeechVoices(cachedVoices);
    } else {
      this.browserVoices = voices;
    }
  }

  /**
   * Sets platform info (for testing).
   *
   * @param platformInfo - Platform detection results
   */
  setPlatformInfo(platformInfo: PlatformInfo): void {
    this.platformInfo = platformInfo;
  }

  /**
   * Resolves a ResponsiveVoice name to an available voice.
   *
   * Uses strategy-first iteration: tries each matching strategy across ALL chain voices
   * before moving to less specific strategies. This ensures that an exact match later
   * in the chain wins over a partial match earlier in the chain.
   *
   * Strategy order (most specific to least):
   * 1. Exact match - try all chain voices
   * 2. Whitespace normalized - try all chain voices
   * 3. Parenthetical stripped - try all chain voices
   * 4. Partial match - try all chain voices
   * 5. Language fallback - last resort
   *
   * Chain order determines preference among equally-good matches only.
   *
   * @param voiceName - The ResponsiveVoice name (e.g., "UK English Female")
   * @returns Resolved voice or null if not found
   */
  private collectVoiceChain(voice: Voice): {
    nativeVoices: SystemVoice[];
    fallbackVoice: SystemVoice | null;
  } {
    const nativeVoices: SystemVoice[] = [];
    let fallbackVoice: SystemVoice | null = null;

    for (const voiceID of voice.voiceIDs) {
      const systemVoice = this.systemVoices.get(voiceID);
      if (!systemVoice) continue;

      if (systemVoice.fallbackVoice) {
        if (!fallbackVoice) fallbackVoice = systemVoice;
      } else if (!this.config.forceFallback) {
        nativeVoices.push(systemVoice);
      }
    }

    return { nativeVoices, fallbackVoice };
  }

  private matchNativeVoice(
    voiceName: string,
    nativeVoices: SystemVoice[],
    responsiveVoice: Voice
  ): ResolvedVoice | null {
    type StrategyDef = {
      name: MatchingStrategy;
      match: (n: string) => SpeechSynthesisVoice | null;
    };
    const strategies: StrategyDef[] = [
      { name: 'exact', match: (n) => this.matcher.exactMatch(n, this.browserVoices) },
      {
        name: 'whitespace',
        match: (n) =>
          this.matcher.whitespaceNormalizedMatch(
            this.matcher.normalizeWhitespace(n),
            this.browserVoices
          ),
      },
      {
        name: 'parenthetical',
        match: (n) =>
          this.matcher.parentheticalStrippedMatch(
            this.matcher.normalizeWhitespace(n),
            this.browserVoices
          ),
      },
      { name: 'partial', match: (n) => this.matcher.partialMatch(n, this.browserVoices) },
    ];

    for (const strategy of strategies) {
      for (const systemVoice of nativeVoices) {
        const match = strategy.match(systemVoice.name);
        if (match) {
          if (strategy.name !== 'exact') {
            debugLog(
              `Voice "${voiceName}": exact match failed for "${systemVoice.name}", ` +
                `resolved via ${strategy.name} strategy to "${match.name}"`
            );
          }
          return this.createNativeResult(responsiveVoice, match, strategy.name);
        }
      }
    }

    return null;
  }

  resolve(voiceName: string): ResolvedVoice | null {
    const responsiveVoice = this.responsiveVoices.get(voiceName);
    if (!responsiveVoice) return null;

    const { nativeVoices, fallbackVoice } = this.collectVoiceChain(responsiveVoice);

    const nativeResult = this.matchNativeVoice(voiceName, nativeVoices, responsiveVoice);
    if (nativeResult) return nativeResult;

    if (fallbackVoice) return this.createFallbackResult(responsiveVoice, fallbackVoice);

    // Language fallback — only if no fallback voice in chain
    if (!this.config.forceFallback && this.browserVoices.length > 0) {
      const langMatch = this.findBestNativeVoiceForLang(responsiveVoice.lang);
      if (langMatch) {
        debugLog(
          `Voice "${voiceName}": no match in chain and no fallback voice, ` +
            `resolved via language fallback to "${langMatch.name}" (${langMatch.lang})`
        );
        return this.createNativeResult(responsiveVoice, langMatch, 'language');
      }
    }

    return null;
  }

  /**
   * Gets all available ResponsiveVoice names.
   *
   * @returns Array of available voice names
   */
  getAvailableVoices(): string[] {
    const available: string[] = [];

    for (const [name, voice] of this.responsiveVoices) {
      // Skip deprecated voices
      if (voice.deprecated) {
        continue;
      }

      // Check if any voiceID is available
      const resolved = this.resolve(name);
      if (resolved) {
        available.push(name);
      }
    }

    return available;
  }

  /**
   * Gets ResponsiveVoice by name without resolution.
   *
   * @param voiceName - The voice name to look up
   * @returns The Voice definition or undefined
   */
  getVoice(voiceName: string): Voice | undefined {
    return this.responsiveVoices.get(voiceName);
  }

  /**
   * Gets all ResponsiveVoice definitions.
   *
   * @returns Array of all Voice definitions
   */
  getAllVoices(): Voice[] {
    return Array.from(this.responsiveVoices.values());
  }

  /**
   * Checks if the resolver has browser voices loaded.
   *
   * @returns True if browser voices are available
   */
  hasBrowserVoices(): boolean {
    return this.browserVoices.length > 0;
  }

  /**
   * Get raw browser voices for reporting
   * Returns the actual SpeechSynthesisVoice objects from the browser
   */
  getBrowserVoices(): SpeechSynthesisVoice[] {
    return [...this.browserVoices];
  }

  /**
   * Gets the number of loaded browser voices.
   *
   * @returns Number of browser voices
   */
  getBrowserVoiceCount(): number {
    return this.browserVoices.length;
  }

  /**
   * Resolves a voice by regex pattern against ResponsiveVoice names.
   * Returns the first non-deprecated voice whose name matches the pattern.
   *
   * @param pattern - RegExp to test against voice names
   * @returns Resolved voice or null if no match
   */
  resolveByPattern(pattern: RegExp): ResolvedVoice | null {
    for (const [name, voice] of this.responsiveVoices) {
      if (voice.deprecated) continue;
      if (pattern.test(name)) {
        return this.resolve(name);
      }
    }
    return null;
  }

  /**
   * Resolves a voice by structured query (all conditions are AND).
   * Filters ResponsiveVoice definitions by language, gender, provider, BYOK status,
   * and name (case-insensitive, exact-first then substring fallback).
   *
   * @param query - Declarative voice selection criteria
   * @returns Resolved voice or null if no match
   */
  /**
   * Check if a voice language matches a query language (exact or prefix match).
   */
  private matchesLang(voiceLang: string, queryLang: string): boolean {
    const vLang = voiceLang.toLowerCase();
    const qLang = queryLang.toLowerCase();
    return vLang === qLang || vLang.startsWith(`${qLang}-`);
  }

  private matchesQueryFilters(voice: Voice, query: VoiceQuery): boolean {
    if (query.lang && !this.matchesLang(voice.lang, query.lang)) return false;

    if (query.gender) {
      const normalized = query.gender === 'male' || query.gender === 'm' ? 'm' : 'f';
      if (voice.gender !== normalized) return false;
    }

    if (query.isByok !== undefined && (voice.isByok ?? false) !== query.isByok) return false;

    if (query.provider) {
      if (!voice.provider || voice.provider.toLowerCase() !== query.provider.toLowerCase()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match a voice name against a query name, returning 'exact', 'substring', or null.
   */
  private matchNamePrecision(voiceName: string, queryName: string): 'exact' | 'substring' | null {
    const vName = voiceName.toLowerCase();
    if (vName === queryName) return 'exact';
    if (vName.includes(queryName)) return 'substring';
    return null;
  }

  resolveByQuery(query: VoiceQuery): ResolvedVoice | null {
    const qName = query.name?.toLowerCase();
    let substringMatch: string | null = null;

    for (const [name, voice] of this.responsiveVoices) {
      if (voice.deprecated) continue;
      if (!this.matchesQueryFilters(voice, query)) continue;

      if (!qName) return this.resolve(name);

      const precision = this.matchNamePrecision(voice.name, qName);
      if (precision === 'exact') return this.resolve(name);
      if (precision === 'substring' && !substringMatch) substringMatch = name;
    }

    return substringMatch ? this.resolve(substringMatch) : null;
  }

  /**
   * Pick the highest-scoring browser voice for the target language. Filters
   * by exact `lang` then by language prefix; ranks via {@link scoreNativeVoice};
   * tie-breaks by browser order.
   *
   * @param lang - BCP-47 language code
   * @returns Best browser voice or null when no voice matches the language
   */
  findBestNativeVoiceForLang(lang: string): SpeechSynthesisVoice | null {
    const prefix = lang.split('-')[0];
    const candidates = this.browserVoices.filter(
      (v) => v.lang === lang || v.lang.startsWith(prefix)
    );
    if (candidates.length === 0) return null;

    let best = candidates[0];
    let bestScore = scoreNativeVoice(best, lang);
    for (let i = 1; i < candidates.length; i++) {
      const score = scoreNativeVoice(candidates[i], lang);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * Creates a resolved voice result for a native browser voice.
   */
  private createNativeResult(
    responsiveVoice: Voice,
    browserVoice: SpeechSynthesisVoice,
    matchStrategy: MatchingStrategy | null
  ): ResolvedVoice {
    return {
      name: responsiveVoice.name,
      lang: responsiveVoice.lang,
      responsiveVoice,
      systemVoice: browserVoice,
      matchStrategy,
    };
  }

  /**
   * Creates a resolved voice result for a fallback HTTP voice.
   */
  private createFallbackResult(responsiveVoice: Voice, systemVoice: SystemVoice): ResolvedVoice {
    const fallbackVoice: FallbackVoiceConfig = {
      service: (systemVoice.service ?? 'g1') as TTSService,
      lang: systemVoice.lang ?? responsiveVoice.lang,
    };

    if (systemVoice.voiceName) {
      fallbackVoice.voiceName = systemVoice.voiceName;
    }

    if (systemVoice.gender) {
      fallbackVoice.gender = systemVoice.gender;
    }

    return {
      name: responsiveVoice.name,
      lang: responsiveVoice.lang,
      responsiveVoice,
      fallbackVoice,
    };
  }
}

/**
 * Shared resolver instance.
 */
let resolverInstance: VoiceResolver | null = null;

/**
 * Gets the shared VoiceResolver instance.
 *
 * @param config - Optional configuration (only used on first call)
 * @returns The shared VoiceResolver
 */
export function getVoiceResolver(config?: VoiceResolverConfig): VoiceResolver {
  if (!resolverInstance) {
    resolverInstance = new VoiceResolver(config);
  }
  return resolverInstance;
}

/**
 * Resets the shared resolver instance (for testing).
 */
export function resetVoiceResolver(): void {
  resolverInstance = null;
}
