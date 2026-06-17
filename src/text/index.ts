/**
 * Text processing module for ResponsiveVoice
 *
 * Provides text chunking, queue management,
 * and custom text replacements for optimal speech synthesis.
 */

// Text chunking - re-exported from @responsivevoice/text
export { hasCJKContent } from '@responsivevoice/text';

// Text queue management
export { TextQueue } from './queue';

// Text replacements
export { type TextReplacementRule, TextReplacements } from './replacements';
