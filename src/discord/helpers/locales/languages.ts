/**
 * Supported bot UI languages (same codes as game map translation files).
 */

export const FALLBACK_LANGUAGE = 'en' as const;

export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'es-419',
  'de',
  'fr',
  'it',
  'pt-BR',
  'pl',
  'ru',
  'tr',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
  'id',
  'vi',
  'th',
  'ar',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Languages accepted by fortnite-api.com (matches our 18 bot UI codes). */
export const FORTNITE_API_LANGUAGES = [
  'ar',
  'de',
  'en',
  'es',
  'es-419',
  'fr',
  'id',
  'it',
  'ja',
  'ko',
  'pl',
  'pt-BR',
  'ru',
  'th',
  'tr',
  'vi',
  'zh-Hans',
  'zh-Hant',
] as const satisfies readonly SupportedLanguage[];

export type FortniteApiLanguage = (typeof FORTNITE_API_LANGUAGES)[number];

export function toFortniteApiLanguage(lang: SupportedLanguage): FortniteApiLanguage {
  return (FORTNITE_API_LANGUAGES as readonly string[]).includes(lang) ? (lang as FortniteApiLanguage) : FALLBACK_LANGUAGE;
}

/** Locales accepted by Discord for slash-command name/description translations. */
export const DISCORD_COMMAND_LOCALES = new Set([
  'id',
  'en-US',
  'en-GB',
  'bg',
  'zh-CN',
  'zh-TW',
  'hr',
  'cs',
  'da',
  'nl',
  'fi',
  'fr',
  'de',
  'el',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'lt',
  'no',
  'pl',
  'pt-BR',
  'ro',
  'ru',
  'es-ES',
  'es-419',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
]);

/** Discord Application Command localization keys per internal language code. */
export const DISCORD_LOCALE_CODES: Record<SupportedLanguage, string[]> = {
  en: ['en-US', 'en-GB'],
  es: ['es-ES'],
  'es-419': ['es-419'],
  de: ['de'],
  fr: ['fr'],
  it: ['it'],
  'pt-BR': ['pt-BR'],
  pl: ['pl'],
  ru: ['ru'],
  tr: ['tr'],
  ja: ['ja'],
  ko: ['ko'],
  'zh-Hans': ['zh-CN'],
  'zh-Hant': ['zh-TW'],
  id: ['id'],
  vi: ['vi'],
  th: ['th'],
  // Arabic is supported for bot UI (ar.json) but not for Discord slash localizations.
  ar: [],
};

const DISCORD_INPUT_MAP: Record<string, SupportedLanguage> = {
  en: 'en',
  'en-US': 'en',
  'en-GB': 'en',
  es: 'es',
  'es-ES': 'es',
  'es-419': 'es-419',
  de: 'de',
  fr: 'fr',
  it: 'it',
  pt: 'pt-BR',
  'pt-BR': 'pt-BR',
  pl: 'pl',
  ru: 'ru',
  tr: 'tr',
  ja: 'ja',
  ko: 'ko',
  zh: 'zh-Hans',
  'zh-CN': 'zh-Hans',
  'zh-Hans': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-Hant': 'zh-Hant',
  id: 'id',
  vi: 'vi',
  th: 'th',
  ar: 'ar',
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function resolveLanguage(input: string | null | undefined): SupportedLanguage {
  if (!input) return FALLBACK_LANGUAGE;
  const direct = DISCORD_INPUT_MAP[input];
  if (direct) return direct;
  const base = input.split('-')[0];
  const fromBase = DISCORD_INPUT_MAP[base];
  if (fromBase) return fromBase;
  return FALLBACK_LANGUAGE;
}

/** Maps any bot language to en/es for legacy inline translation tables not yet migrated. */
export type LegacyLanguage = 'en' | 'es';

export function toLegacyLanguage(lang: SupportedLanguage): LegacyLanguage {
  return lang === 'es' || lang === 'es-419' ? 'es' : 'en';
}

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Español',
  'es-419': 'Español (LATAM)',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  'pt-BR': 'Português (BR)',
  pl: 'Polski',
  ru: 'Русский',
  tr: 'Türkçe',
  ja: '日本語',
  ko: '한국어',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  ar: 'العربية',
};
