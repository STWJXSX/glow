import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from './languages.ts';

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  'es-419': '🌎',
  de: '🇩🇪',
  fr: '🇫🇷',
  it: '🇮🇹',
  'pt-BR': '🇧🇷',
  pl: '🇵🇱',
  ru: '🇷🇺',
  tr: '🇹🇷',
  ja: '🇯🇵',
  ko: '🇰🇷',
  'zh-Hans': '🇨🇳',
  'zh-Hant': '🇹🇼',
  id: '🇮🇩',
  vi: '🇻🇳',
  th: '🇹🇭',
  ar: '🇸🇦',
};

/** Flag + native label per bot language (language pickers). */
export const LANGUAGE_DISPLAY: Record<
  SupportedLanguage,
  { flag: string; label: string }
> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((code) => [
    code,
    {
      flag: LANGUAGE_FLAGS[code] ?? '🌐',
      label: LANGUAGE_LABELS[code],
    },
  ]),
) as Record<SupportedLanguage, { flag: string; label: string }>;
