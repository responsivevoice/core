/**
 * iOS Voice Cache
 *
 * Pre-cached voice lists for iOS versions where getVoices() may return empty.
 * These caches are used as fallback when the browser fails to report voices.
 *
 * Cache versions:
 * - legacy: iOS below 9 (40 voices)
 * - ios9: iOS 9 (38 voices)
 * - ios10: iOS 10+ (58 voices with Enhanced variants)
 * - ios11: iOS 11+ (52 voices)
 */

import type { PlatformInfo } from '../platform';
import type { CachedIOSVoice, IOSCacheVersion } from './types';

/**
 * iOS legacy voices (iOS below 9).
 * Simple language-based voices without named personalities.
 */
export const IOS_LEGACY_VOICES: CachedIOSVoice[] = [
  { name: 'he-IL', voiceURI: 'he-IL', lang: 'he-IL' },
  { name: 'th-TH', voiceURI: 'th-TH', lang: 'th-TH' },
  { name: 'pt-BR', voiceURI: 'pt-BR', lang: 'pt-BR' },
  { name: 'sk-SK', voiceURI: 'sk-SK', lang: 'sk-SK' },
  { name: 'fr-CA', voiceURI: 'fr-CA', lang: 'fr-CA' },
  { name: 'ro-RO', voiceURI: 'ro-RO', lang: 'ro-RO' },
  { name: 'no-NO', voiceURI: 'no-NO', lang: 'no-NO' },
  { name: 'fi-FI', voiceURI: 'fi-FI', lang: 'fi-FI' },
  { name: 'pl-PL', voiceURI: 'pl-PL', lang: 'pl-PL' },
  { name: 'de-DE', voiceURI: 'de-DE', lang: 'de-DE' },
  { name: 'nl-NL', voiceURI: 'nl-NL', lang: 'nl-NL' },
  { name: 'id-ID', voiceURI: 'id-ID', lang: 'id-ID' },
  { name: 'tr-TR', voiceURI: 'tr-TR', lang: 'tr-TR' },
  { name: 'it-IT', voiceURI: 'it-IT', lang: 'it-IT' },
  { name: 'pt-PT', voiceURI: 'pt-PT', lang: 'pt-PT' },
  { name: 'fr-FR', voiceURI: 'fr-FR', lang: 'fr-FR' },
  { name: 'ru-RU', voiceURI: 'ru-RU', lang: 'ru-RU' },
  { name: 'es-MX', voiceURI: 'es-MX', lang: 'es-MX' },
  { name: 'zh-HK', voiceURI: 'zh-HK', lang: 'zh-HK' },
  { name: 'sv-SE', voiceURI: 'sv-SE', lang: 'sv-SE' },
  { name: 'hu-HU', voiceURI: 'hu-HU', lang: 'hu-HU' },
  { name: 'zh-TW', voiceURI: 'zh-TW', lang: 'zh-TW' },
  { name: 'es-ES', voiceURI: 'es-ES', lang: 'es-ES' },
  { name: 'zh-CN', voiceURI: 'zh-CN', lang: 'zh-CN' },
  { name: 'nl-BE', voiceURI: 'nl-BE', lang: 'nl-BE' },
  { name: 'en-GB', voiceURI: 'en-GB', lang: 'en-GB' },
  { name: 'ar-SA', voiceURI: 'ar-SA', lang: 'ar-SA' },
  { name: 'ko-KR', voiceURI: 'ko-KR', lang: 'ko-KR' },
  { name: 'cs-CZ', voiceURI: 'cs-CZ', lang: 'cs-CZ' },
  { name: 'en-ZA', voiceURI: 'en-ZA', lang: 'en-ZA' },
  { name: 'en-AU', voiceURI: 'en-AU', lang: 'en-AU' },
  { name: 'da-DK', voiceURI: 'da-DK', lang: 'da-DK' },
  { name: 'en-US', voiceURI: 'en-US', lang: 'en-US' },
  { name: 'en-IE', voiceURI: 'en-IE', lang: 'en-IE' },
  { name: 'hi-IN', voiceURI: 'hi-IN', lang: 'hi-IN' },
  { name: 'el-GR', voiceURI: 'el-GR', lang: 'el-GR' },
  { name: 'ja-JP', voiceURI: 'ja-JP', lang: 'ja-JP' },
];

/**
 * iOS 9 voices (38 voices).
 * Named voices with compact variants and one Enhanced voice.
 */
export const IOS9_VOICES: CachedIOSVoice[] = [
  {
    name: 'Maged',
    voiceURI: 'com.apple.ttsbundle.Maged-compact',
    lang: 'ar-SA',
    localService: true,
    default: true,
  },
  {
    name: 'Zuzana',
    voiceURI: 'com.apple.ttsbundle.Zuzana-compact',
    lang: 'cs-CZ',
    localService: true,
    default: true,
  },
  {
    name: 'Sara',
    voiceURI: 'com.apple.ttsbundle.Sara-compact',
    lang: 'da-DK',
    localService: true,
    default: true,
  },
  {
    name: 'Anna',
    voiceURI: 'com.apple.ttsbundle.Anna-compact',
    lang: 'de-DE',
    localService: true,
    default: true,
  },
  {
    name: 'Melina',
    voiceURI: 'com.apple.ttsbundle.Melina-compact',
    lang: 'el-GR',
    localService: true,
    default: true,
  },
  {
    name: 'Karen',
    voiceURI: 'com.apple.ttsbundle.Karen-compact',
    lang: 'en-AU',
    localService: true,
    default: true,
  },
  {
    name: 'Daniel',
    voiceURI: 'com.apple.ttsbundle.Daniel-compact',
    lang: 'en-GB',
    localService: true,
    default: true,
  },
  {
    name: 'Moira',
    voiceURI: 'com.apple.ttsbundle.Moira-compact',
    lang: 'en-IE',
    localService: true,
    default: true,
  },
  {
    name: 'Samantha (Enhanced)',
    voiceURI: 'com.apple.ttsbundle.Samantha-premium',
    lang: 'en-US',
    localService: true,
    default: true,
  },
  {
    name: 'Samantha',
    voiceURI: 'com.apple.ttsbundle.Samantha-compact',
    lang: 'en-US',
    localService: true,
    default: true,
  },
  {
    name: 'Tessa',
    voiceURI: 'com.apple.ttsbundle.Tessa-compact',
    lang: 'en-ZA',
    localService: true,
    default: true,
  },
  {
    name: 'Monica',
    voiceURI: 'com.apple.ttsbundle.Monica-compact',
    lang: 'es-ES',
    localService: true,
    default: true,
  },
  {
    name: 'Paulina',
    voiceURI: 'com.apple.ttsbundle.Paulina-compact',
    lang: 'es-MX',
    localService: true,
    default: true,
  },
  {
    name: 'Satu',
    voiceURI: 'com.apple.ttsbundle.Satu-compact',
    lang: 'fi-FI',
    localService: true,
    default: true,
  },
  {
    name: 'Amelie',
    voiceURI: 'com.apple.ttsbundle.Amelie-compact',
    lang: 'fr-CA',
    localService: true,
    default: true,
  },
  {
    name: 'Thomas',
    voiceURI: 'com.apple.ttsbundle.Thomas-compact',
    lang: 'fr-FR',
    localService: true,
    default: true,
  },
  {
    name: 'Carmit',
    voiceURI: 'com.apple.ttsbundle.Carmit-compact',
    lang: 'he-IL',
    localService: true,
    default: true,
  },
  {
    name: 'Lekha',
    voiceURI: 'com.apple.ttsbundle.Lekha-compact',
    lang: 'hi-IN',
    localService: true,
    default: true,
  },
  {
    name: 'Mariska',
    voiceURI: 'com.apple.ttsbundle.Mariska-compact',
    lang: 'hu-HU',
    localService: true,
    default: true,
  },
  {
    name: 'Damayanti',
    voiceURI: 'com.apple.ttsbundle.Damayanti-compact',
    lang: 'id-ID',
    localService: true,
    default: true,
  },
  {
    name: 'Alice',
    voiceURI: 'com.apple.ttsbundle.Alice-compact',
    lang: 'it-IT',
    localService: true,
    default: true,
  },
  {
    name: 'Kyoko',
    voiceURI: 'com.apple.ttsbundle.Kyoko-compact',
    lang: 'ja-JP',
    localService: true,
    default: true,
  },
  {
    name: 'Yuna',
    voiceURI: 'com.apple.ttsbundle.Yuna-compact',
    lang: 'ko-KR',
    localService: true,
    default: true,
  },
  {
    name: 'Ellen',
    voiceURI: 'com.apple.ttsbundle.Ellen-compact',
    lang: 'nl-BE',
    localService: true,
    default: true,
  },
  {
    name: 'Xander',
    voiceURI: 'com.apple.ttsbundle.Xander-compact',
    lang: 'nl-NL',
    localService: true,
    default: true,
  },
  {
    name: 'Nora',
    voiceURI: 'com.apple.ttsbundle.Nora-compact',
    lang: 'no-NO',
    localService: true,
    default: true,
  },
  {
    name: 'Zosia',
    voiceURI: 'com.apple.ttsbundle.Zosia-compact',
    lang: 'pl-PL',
    localService: true,
    default: true,
  },
  {
    name: 'Luciana',
    voiceURI: 'com.apple.ttsbundle.Luciana-compact',
    lang: 'pt-BR',
    localService: true,
    default: true,
  },
  {
    name: 'Joana',
    voiceURI: 'com.apple.ttsbundle.Joana-compact',
    lang: 'pt-PT',
    localService: true,
    default: true,
  },
  {
    name: 'Ioana',
    voiceURI: 'com.apple.ttsbundle.Ioana-compact',
    lang: 'ro-RO',
    localService: true,
    default: true,
  },
  {
    name: 'Milena',
    voiceURI: 'com.apple.ttsbundle.Milena-compact',
    lang: 'ru-RU',
    localService: true,
    default: true,
  },
  {
    name: 'Laura',
    voiceURI: 'com.apple.ttsbundle.Laura-compact',
    lang: 'sk-SK',
    localService: true,
    default: true,
  },
  {
    name: 'Alva',
    voiceURI: 'com.apple.ttsbundle.Alva-compact',
    lang: 'sv-SE',
    localService: true,
    default: true,
  },
  {
    name: 'Kanya',
    voiceURI: 'com.apple.ttsbundle.Kanya-compact',
    lang: 'th-TH',
    localService: true,
    default: true,
  },
  {
    name: 'Yelda',
    voiceURI: 'com.apple.ttsbundle.Yelda-compact',
    lang: 'tr-TR',
    localService: true,
    default: true,
  },
  {
    name: 'Ting-Ting',
    voiceURI: 'com.apple.ttsbundle.Ting-Ting-compact',
    lang: 'zh-CN',
    localService: true,
    default: true,
  },
  {
    name: 'Sin-Ji',
    voiceURI: 'com.apple.ttsbundle.Sin-Ji-compact',
    lang: 'zh-HK',
    localService: true,
    default: true,
  },
  {
    name: 'Mei-Jia',
    voiceURI: 'com.apple.ttsbundle.Mei-Jia-compact',
    lang: 'zh-TW',
    localService: true,
    default: true,
  },
];

/* jscpd:ignore-start
 * IOS10_VOICES and IOS11_VOICES are hand-authored snapshots of Apple's
 * shipped voice catalog for those iOS versions. The versions are frozen
 * in history, so the overlap between the two arrays is intentional and
 * will not change. Refactoring them to a derivation scheme would obscure
 * that they are literal transcriptions of Apple's docs. */
/**
 * iOS 10 voices (58 voices).
 * Includes Siri voices and Enhanced/Premium variants.
 */
export const IOS10_VOICES: CachedIOSVoice[] = [
  { name: 'Maged', voiceURI: 'com.apple.ttsbundle.Maged-compact', lang: 'ar-SA' },
  { name: 'Zuzana', voiceURI: 'com.apple.ttsbundle.Zuzana-compact', lang: 'cs-CZ' },
  { name: 'Sara', voiceURI: 'com.apple.ttsbundle.Sara-compact', lang: 'da-DK' },
  { name: 'Anna', voiceURI: 'com.apple.ttsbundle.Anna-compact', lang: 'de-DE' },
  {
    name: 'Helena',
    voiceURI: 'com.apple.ttsbundle.siri_female_de-DE_compact',
    lang: 'de-DE',
  },
  {
    name: 'Martin',
    voiceURI: 'com.apple.ttsbundle.siri_male_de-DE_compact',
    lang: 'de-DE',
  },
  {
    name: 'Nikos (Enhanced)',
    voiceURI: 'com.apple.ttsbundle.Nikos-premium',
    lang: 'el-GR',
  },
  { name: 'Melina', voiceURI: 'com.apple.ttsbundle.Melina-compact', lang: 'el-GR' },
  { name: 'Nikos', voiceURI: 'com.apple.ttsbundle.Nikos-compact', lang: 'el-GR' },
  {
    name: 'Catherine',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-AU_compact',
    lang: 'en-AU',
  },
  {
    name: 'Gordon',
    voiceURI: 'com.apple.ttsbundle.siri_male_en-AU_compact',
    lang: 'en-AU',
  },
  { name: 'Karen', voiceURI: 'com.apple.ttsbundle.Karen-compact', lang: 'en-AU' },
  {
    name: 'Daniel (Enhanced)',
    voiceURI: 'com.apple.ttsbundle.Daniel-premium',
    lang: 'en-GB',
  },
  {
    name: 'Arthur',
    voiceURI: 'com.apple.ttsbundle.siri_male_en-GB_compact',
    lang: 'en-GB',
  },
  { name: 'Daniel', voiceURI: 'com.apple.ttsbundle.Daniel-compact', lang: 'en-GB' },
  {
    name: 'Martha',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-GB_compact',
    lang: 'en-GB',
  },
  { name: 'Moira', voiceURI: 'com.apple.ttsbundle.Moira-compact', lang: 'en-IE' },
  {
    name: 'Nicky (Enhanced)',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-US_premium',
    lang: 'en-US',
  },
  {
    name: 'Samantha (Enhanced)',
    voiceURI: 'com.apple.ttsbundle.Samantha-premium',
    lang: 'en-US',
  },
  {
    name: 'Aaron',
    voiceURI: 'com.apple.ttsbundle.siri_male_en-US_compact',
    lang: 'en-US',
  },
  { name: 'Fred', voiceURI: 'com.apple.speech.synthesis.voice.Fred', lang: 'en-US' },
  {
    name: 'Nicky',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-US_compact',
    lang: 'en-US',
  },
  {
    name: 'Samantha',
    voiceURI: 'com.apple.ttsbundle.Samantha-compact',
    lang: 'en-US',
  },
  { name: 'Tessa', voiceURI: 'com.apple.ttsbundle.Tessa-compact', lang: 'en-ZA' },
  { name: 'Monica', voiceURI: 'com.apple.ttsbundle.Monica-compact', lang: 'es-ES' },
  { name: 'Paulina', voiceURI: 'com.apple.ttsbundle.Paulina-compact', lang: 'es-MX' },
  { name: 'Satu', voiceURI: 'com.apple.ttsbundle.Satu-compact', lang: 'fi-FI' },
  { name: 'Amelie', voiceURI: 'com.apple.ttsbundle.Amelie-compact', lang: 'fr-CA' },
  {
    name: 'Daniel',
    voiceURI: 'com.apple.ttsbundle.siri_male_fr-FR_compact',
    lang: 'fr-FR',
  },
  {
    name: 'Marie',
    voiceURI: 'com.apple.ttsbundle.siri_female_fr-FR_compact',
    lang: 'fr-FR',
  },
  { name: 'Thomas', voiceURI: 'com.apple.ttsbundle.Thomas-compact', lang: 'fr-FR' },
  { name: 'Carmit', voiceURI: 'com.apple.ttsbundle.Carmit-compact', lang: 'he-IL' },
  { name: 'Lekha', voiceURI: 'com.apple.ttsbundle.Lekha-compact', lang: 'hi-IN' },
  { name: 'Mariska', voiceURI: 'com.apple.ttsbundle.Mariska-compact', lang: 'hu-HU' },
  {
    name: 'Damayanti',
    voiceURI: 'com.apple.ttsbundle.Damayanti-compact',
    lang: 'id-ID',
  },
  { name: 'Alice', voiceURI: 'com.apple.ttsbundle.Alice-compact', lang: 'it-IT' },
  {
    name: 'Hattori',
    voiceURI: 'com.apple.ttsbundle.siri_male_ja-JP_compact',
    lang: 'ja-JP',
  },
  { name: 'Kyoko', voiceURI: 'com.apple.ttsbundle.Kyoko-compact', lang: 'ja-JP' },
  {
    name: 'O-ren',
    voiceURI: 'com.apple.ttsbundle.siri_female_ja-JP_compact',
    lang: 'ja-JP',
  },
  { name: 'Yuna', voiceURI: 'com.apple.ttsbundle.Yuna-compact', lang: 'ko-KR' },
  { name: 'Ellen', voiceURI: 'com.apple.ttsbundle.Ellen-compact', lang: 'nl-BE' },
  { name: 'Xander', voiceURI: 'com.apple.ttsbundle.Xander-compact', lang: 'nl-NL' },
  { name: 'Nora', voiceURI: 'com.apple.ttsbundle.Nora-compact', lang: 'no-NO' },
  { name: 'Zosia', voiceURI: 'com.apple.ttsbundle.Zosia-compact', lang: 'pl-PL' },
  { name: 'Luciana', voiceURI: 'com.apple.ttsbundle.Luciana-compact', lang: 'pt-BR' },
  { name: 'Joana', voiceURI: 'com.apple.ttsbundle.Joana-compact', lang: 'pt-PT' },
  { name: 'Ioana', voiceURI: 'com.apple.ttsbundle.Ioana-compact', lang: 'ro-RO' },
  { name: 'Milena', voiceURI: 'com.apple.ttsbundle.Milena-compact', lang: 'ru-RU' },
  { name: 'Laura', voiceURI: 'com.apple.ttsbundle.Laura-compact', lang: 'sk-SK' },
  { name: 'Alva', voiceURI: 'com.apple.ttsbundle.Alva-compact', lang: 'sv-SE' },
  { name: 'Kanya', voiceURI: 'com.apple.ttsbundle.Kanya-compact', lang: 'th-TH' },
  { name: 'Yelda', voiceURI: 'com.apple.ttsbundle.Yelda-compact', lang: 'tr-TR' },
  {
    name: 'Li-mu',
    voiceURI: 'com.apple.ttsbundle.siri_male_zh-CN_compact',
    lang: 'zh-CN',
  },
  {
    name: 'Ting-Ting',
    voiceURI: 'com.apple.ttsbundle.Ting-Ting-compact',
    lang: 'zh-CN',
  },
  {
    name: 'Yu-shu',
    voiceURI: 'com.apple.ttsbundle.siri_female_zh-CN_compact',
    lang: 'zh-CN',
  },
  { name: 'Sin-Ji', voiceURI: 'com.apple.ttsbundle.Sin-Ji-compact', lang: 'zh-HK' },
  { name: 'Mei-Jia', voiceURI: 'com.apple.ttsbundle.Mei-Jia-compact', lang: 'zh-TW' },
];

/**
 * iOS 11 voices (52 voices).
 * Similar to iOS 10 but without some Enhanced variants.
 */
export const IOS11_VOICES: CachedIOSVoice[] = [
  { name: 'Maged', voiceURI: 'com.apple.ttsbundle.Maged-compact', lang: 'ar-SA' },
  { name: 'Zuzana', voiceURI: 'com.apple.ttsbundle.Zuzana-compact', lang: 'cs-CZ' },
  { name: 'Sara', voiceURI: 'com.apple.ttsbundle.Sara-compact', lang: 'da-DK' },
  { name: 'Anna', voiceURI: 'com.apple.ttsbundle.Anna-compact', lang: 'de-DE' },
  {
    name: 'Helena',
    voiceURI: 'com.apple.ttsbundle.siri_female_de-DE_compact',
    lang: 'de-DE',
  },
  {
    name: 'Martin',
    voiceURI: 'com.apple.ttsbundle.siri_male_de-DE_compact',
    lang: 'de-DE',
  },
  { name: 'Melina', voiceURI: 'com.apple.ttsbundle.Melina-compact', lang: 'el-GR' },
  {
    name: 'Catherine',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-AU_compact',
    lang: 'en-AU',
  },
  {
    name: 'Gordon',
    voiceURI: 'com.apple.ttsbundle.siri_male_en-AU_compact',
    lang: 'en-AU',
  },
  { name: 'Karen', voiceURI: 'com.apple.ttsbundle.Karen-compact', lang: 'en-AU' },
  {
    name: 'Arthur',
    voiceURI: 'com.apple.ttsbundle.siri_male_en-GB_compact',
    lang: 'en-GB',
  },
  { name: 'Daniel', voiceURI: 'com.apple.ttsbundle.Daniel-compact', lang: 'en-GB' },
  {
    name: 'Martha',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-GB_compact',
    lang: 'en-GB',
  },
  { name: 'Moira', voiceURI: 'com.apple.ttsbundle.Moira-compact', lang: 'en-IE' },
  {
    name: 'Aaron',
    voiceURI: 'com.apple.ttsbundle.siri_male_en-US_compact',
    lang: 'en-US',
  },
  { name: 'Fred', voiceURI: 'com.apple.speech.synthesis.voice.Fred', lang: 'en-US' },
  {
    name: 'Nicky',
    voiceURI: 'com.apple.ttsbundle.siri_female_en-US_compact',
    lang: 'en-US',
  },
  {
    name: 'Samantha',
    voiceURI: 'com.apple.ttsbundle.Samantha-compact',
    lang: 'en-US',
  },
  { name: 'Tessa', voiceURI: 'com.apple.ttsbundle.Tessa-compact', lang: 'en-ZA' },
  { name: 'Monica', voiceURI: 'com.apple.ttsbundle.Monica-compact', lang: 'es-ES' },
  { name: 'Paulina', voiceURI: 'com.apple.ttsbundle.Paulina-compact', lang: 'es-MX' },
  { name: 'Satu', voiceURI: 'com.apple.ttsbundle.Satu-compact', lang: 'fi-FI' },
  { name: 'Amelie', voiceURI: 'com.apple.ttsbundle.Amelie-compact', lang: 'fr-CA' },
  {
    name: 'Daniel',
    voiceURI: 'com.apple.ttsbundle.siri_male_fr-FR_compact',
    lang: 'fr-FR',
  },
  {
    name: 'Marie',
    voiceURI: 'com.apple.ttsbundle.siri_female_fr-FR_compact',
    lang: 'fr-FR',
  },
  { name: 'Thomas', voiceURI: 'com.apple.ttsbundle.Thomas-compact', lang: 'fr-FR' },
  { name: 'Carmit', voiceURI: 'com.apple.ttsbundle.Carmit-compact', lang: 'he-IL' },
  { name: 'Lekha', voiceURI: 'com.apple.ttsbundle.Lekha-compact', lang: 'hi-IN' },
  { name: 'Mariska', voiceURI: 'com.apple.ttsbundle.Mariska-compact', lang: 'hu-HU' },
  {
    name: 'Damayanti',
    voiceURI: 'com.apple.ttsbundle.Damayanti-compact',
    lang: 'id-ID',
  },
  { name: 'Alice', voiceURI: 'com.apple.ttsbundle.Alice-compact', lang: 'it-IT' },
  {
    name: 'Hattori',
    voiceURI: 'com.apple.ttsbundle.siri_male_ja-JP_compact',
    lang: 'ja-JP',
  },
  { name: 'Kyoko', voiceURI: 'com.apple.ttsbundle.Kyoko-compact', lang: 'ja-JP' },
  {
    name: 'O-ren',
    voiceURI: 'com.apple.ttsbundle.siri_female_ja-JP_compact',
    lang: 'ja-JP',
  },
  { name: 'Yuna', voiceURI: 'com.apple.ttsbundle.Yuna-compact', lang: 'ko-KR' },
  { name: 'Ellen', voiceURI: 'com.apple.ttsbundle.Ellen-compact', lang: 'nl-BE' },
  { name: 'Xander', voiceURI: 'com.apple.ttsbundle.Xander-compact', lang: 'nl-NL' },
  { name: 'Nora', voiceURI: 'com.apple.ttsbundle.Nora-compact', lang: 'no-NO' },
  { name: 'Zosia', voiceURI: 'com.apple.ttsbundle.Zosia-compact', lang: 'pl-PL' },
  { name: 'Luciana', voiceURI: 'com.apple.ttsbundle.Luciana-compact', lang: 'pt-BR' },
  { name: 'Joana', voiceURI: 'com.apple.ttsbundle.Joana-compact', lang: 'pt-PT' },
  { name: 'Ioana', voiceURI: 'com.apple.ttsbundle.Ioana-compact', lang: 'ro-RO' },
  { name: 'Milena', voiceURI: 'com.apple.ttsbundle.Milena-compact', lang: 'ru-RU' },
  { name: 'Laura', voiceURI: 'com.apple.ttsbundle.Laura-compact', lang: 'sk-SK' },
  { name: 'Alva', voiceURI: 'com.apple.ttsbundle.Alva-compact', lang: 'sv-SE' },
  { name: 'Kanya', voiceURI: 'com.apple.ttsbundle.Kanya-compact', lang: 'th-TH' },
  { name: 'Yelda', voiceURI: 'com.apple.ttsbundle.Yelda-compact', lang: 'tr-TR' },
  {
    name: 'Li-mu',
    voiceURI: 'com.apple.ttsbundle.siri_male_zh-CN_compact',
    lang: 'zh-CN',
  },
  {
    name: 'Ting-Ting',
    voiceURI: 'com.apple.ttsbundle.Ting-Ting-compact',
    lang: 'zh-CN',
  },
  {
    name: 'Yu-shu',
    voiceURI: 'com.apple.ttsbundle.siri_female_zh-CN_compact',
    lang: 'zh-CN',
  },
  { name: 'Sin-Ji', voiceURI: 'com.apple.ttsbundle.Sin-Ji-compact', lang: 'zh-HK' },
  { name: 'Mei-Jia', voiceURI: 'com.apple.ttsbundle.Mei-Jia-compact', lang: 'zh-TW' },
];
/* jscpd:ignore-end */

/**
 * Map of iOS versions to their voice caches.
 */
const VOICE_CACHE_MAP: Record<IOSCacheVersion, CachedIOSVoice[]> = {
  legacy: IOS_LEGACY_VOICES,
  ios9: IOS9_VOICES,
  ios10: IOS10_VOICES,
  ios11: IOS11_VOICES,
};

/**
 * Gets the appropriate iOS voice cache based on platform information.
 *
 * @param platform - Platform detection results
 * @returns The appropriate voice cache for the iOS version
 */
export function getIOSVoiceCache(platform: PlatformInfo): CachedIOSVoice[] {
  const version = getIOSCacheVersion(platform);
  return VOICE_CACHE_MAP[version];
}

/**
 * Determines the iOS cache version based on platform information.
 *
 * @param platform - Platform detection results
 * @returns The iOS cache version identifier
 */
export function getIOSCacheVersion(platform: PlatformInfo): IOSCacheVersion {
  if (platform.isIOS11Plus) {
    return 'ios11';
  }
  if (platform.isIOS10) {
    return 'ios10';
  }
  if (platform.isIOS9) {
    return 'ios9';
  }
  return 'legacy';
}

/**
 * Converts cached iOS voices to SpeechSynthesisVoice-like objects.
 * This allows cached voices to be used with the VoiceMatcher.
 *
 * @param cachedVoices - Array of cached iOS voices
 * @returns Array of SpeechSynthesisVoice-like objects
 */
export function cachedVoicesToSpeechVoices(cachedVoices: CachedIOSVoice[]): SpeechSynthesisVoice[] {
  return cachedVoices.map((cached) => ({
    name: cached.name,
    voiceURI: cached.voiceURI,
    lang: cached.lang,
    localService: cached.localService ?? true,
    default: cached.default ?? false,
  }));
}
