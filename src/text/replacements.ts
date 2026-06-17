/**
 * Text replacement rule with optional voice filtering
 */
export interface TextReplacementRule {
  /** String pattern or RegExp to match. Strings support /pattern/flags format */
  searchvalue: string | RegExp;
  /** Replacement text */
  newvalue: string;
  /** Optional: Apply only for these collection voice names */
  collectionvoices?: string | string[];
  /** Optional: Apply only for these system voice names */
  systemvoices?: string | string[];
}

/**
 * Voice profile for matching replacements
 */
export interface VoiceProfile {
  /** Collection voice information */
  collectionvoice?: { name: string };
  /** System voice information */
  systemvoice?: { name: string };
}

/**
 * Parsed replacement rule (internal)
 */
interface ParsedRule {
  searchvalue: RegExp;
  newvalue: string;
  collectionvoices: string[] | null;
  systemvoices: string[] | null;
}

/**
 * Text replacement manager for custom text transformations.
 *
 * Supports regex-based text replacements with optional voice-specific filtering.
 * Rules can target specific collection voices or system voices, allowing
 * different transformations for different TTS engines.
 *
 * @example
 * ```typescript
 * const replacements = new TextReplacements();
 *
 * // Simple string replacement
 * replacements.setRules([
 *   { searchvalue: 'API', newvalue: 'A P I' }
 * ]);
 *
 * // Regex replacement
 * replacements.setRules([
 *   { searchvalue: '/\\b(\\d+)\\b/g', newvalue: 'number $1' }
 * ]);
 *
 * // Voice-specific replacement
 * replacements.setRules([
 *   {
 *     searchvalue: 'hello',
 *     newvalue: 'howdy',
 *     collectionvoices: ['US English Male']
 *   }
 * ]);
 *
 * const result = replacements.apply('hello world', {
 *   collectionvoice: { name: 'US English Male' }
 * });
 * // Result: 'howdy world'
 * ```
 */
export class TextReplacements {
  private rules: ParsedRule[] = [];

  /**
   * Set text replacement rules.
   *
   * @param rules - Array of replacement rules, or null to clear all rules
   *
   * @example
   * ```typescript
   * // Set rules
   * replacements.setRules([
   *   { searchvalue: 'foo', newvalue: 'bar' }
   * ]);
   *
   * // Clear rules
   * replacements.setRules(null);
   * ```
   */
  setRules(rules: TextReplacementRule[] | null): void {
    if (rules === null) {
      this.rules = [];
      return;
    }

    this.rules = [];
    for (const rule of rules) {
      try {
        this.rules.push(this.parseRule(rule));
      } catch (e) {
        console.warn('ResponsiveVoice: Invalid text replacement rule, skipping:', rule, e);
      }
    }
  }

  /**
   * Apply text replacements based on voice profile.
   *
   * @param text - The text to transform
   * @param profile - Optional voice profile for filtering rules
   * @returns The transformed text
   */
  apply(text: string, profile?: VoiceProfile): string {
    if (this.rules.length === 0) {
      return text;
    }

    let result = text;
    try {
      for (const rule of this.rules) {
        if (this.shouldApply(rule, profile)) {
          result = result.replace(rule.searchvalue, rule.newvalue);
        }
      }
      return result;
    } catch (_e) {
      console.warn(
        'ResponsiveVoice: There was an error while processing the textReplacements array'
      );
      return text;
    }
  }

  /**
   * Clear all replacement rules.
   */
  clear(): void {
    this.rules = [];
  }

  /**
   * Get the current number of active rules.
   */
  get ruleCount(): number {
    return this.rules.length;
  }

  /**
   * Check if any rules are configured.
   */
  get hasRules(): boolean {
    return this.rules.length > 0;
  }

  // -- Private methods --

  /**
   * Parse a rule from user input to internal format.
   */
  private parseRule(rule: TextReplacementRule): ParsedRule {
    return {
      searchvalue: this.parseSearchValue(rule.searchvalue),
      newvalue: rule.newvalue,
      collectionvoices: this.normalizeVoiceFilter(rule.collectionvoices),
      systemvoices: this.normalizeVoiceFilter(rule.systemvoices),
    };
  }

  /**
   * Parse search value to RegExp.
   * Supports:
   * - RegExp objects (passed through)
   * - /pattern/flags format strings
   * - Plain strings (converted to global regex)
   */
  private parseSearchValue(value: string | RegExp): RegExp {
    if (value instanceof RegExp) {
      return value;
    }

    // Try to parse /pattern/flags format
    try {
      const match = value.match(/^\/(.*)\/([gimy]*)$/);
      if (match) {
        const pattern = match[1];
        const flags = match[2];
        return new RegExp(pattern, flags);
      }
    } catch {
      // Fall through to escape and create global regex
    }

    // Default: escape special chars and create global string replacement
    return new RegExp(this.escapeRegExp(value), 'g');
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Normalize voice filter to array format.
   */
  private normalizeVoiceFilter(voices?: string | string[]): string[] | null {
    if (!voices) {
      return null;
    }
    return Array.isArray(voices) ? voices : [voices];
  }

  /**
   * Check if a rule should be applied based on voice profile.
   */
  private shouldApply(rule: ParsedRule, profile?: VoiceProfile): boolean {
    const collectionMatch = this.matchesVoiceFilter(
      rule.collectionvoices,
      profile?.collectionvoice?.name
    );
    const systemMatch = this.matchesVoiceFilter(rule.systemvoices, profile?.systemvoice?.name);

    // Both filters must match (if specified)
    return collectionMatch && systemMatch;
  }

  /**
   * Check if a voice name matches a filter.
   * - No filter (null) = always matches
   * - Filter exists but no voice name = no match
   * - Filter exists and voice name in filter = match
   */
  private matchesVoiceFilter(filter: string[] | null, voiceName?: string): boolean {
    if (!filter) {
      return true; // No filter = match all
    }
    if (!voiceName) {
      return false; // Filter exists but no voice = no match
    }
    return filter.includes(voiceName);
  }
}

/**
 * Create a new TextReplacements instance.
 *
 * @returns A new TextReplacements instance
 */
export function createTextReplacements(): TextReplacements {
  return new TextReplacements();
}
