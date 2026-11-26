import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { log } from '../core/logger.ts';
import UserLocaleModel from '#models/UserLocale.ts';
import {
  DISCORD_LOCALE_CODES,
  DISCORD_COMMAND_LOCALES,
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  resolveLanguage,
  type SupportedLanguage,
} from './languages.ts';

export type { SupportedLanguage } from './languages.ts';
export {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  LANGUAGE_LABELS,
  DISCORD_LOCALE_CODES,
  resolveLanguage,
  toLegacyLanguage,
  toFortniteApiLanguage,
  FORTNITE_API_LANGUAGES,
} from './languages.ts';

/** Primary Discord Application Command locale for a bot language. */
export function getDiscordSlashLocale(lang: SupportedLanguage): string {
  const codes = DISCORD_LOCALE_CODES[lang];
  if (codes?.length) return codes[0];
  return 'en-US';
}

/** Resolve localized slash name/description from Discord's locale map. */
export function resolveSlashLocalization(
  defaultText: string,
  localizations: Record<string, string> | undefined | null,
  lang: SupportedLanguage,
): string {
  if (!localizations || Object.keys(localizations).length === 0) return defaultText;

  const primary = getDiscordSlashLocale(lang);
  if (localizations[primary]) return localizations[primary];

  for (const code of DISCORD_LOCALE_CODES[lang] ?? []) {
    if (localizations[code]) return localizations[code];
  }

  for (const code of DISCORD_LOCALE_CODES.en) {
    if (localizations[code]) return localizations[code];
  }

  return defaultText;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UserLocale: any = UserLocaleModel;

let LEGACY_TRANSLATIONS: Record<string, any> = { fallback: FALLBACK_LANGUAGE };

const langFileCache = new Map<SupportedLanguage, Record<string, unknown>>();
const userLanguageCache = new Map<string, { lang: SupportedLanguage; expiry: number }>();
const USER_LANG_CACHE_TTL = 30 * 60 * 1000;

function loadLegacyTranslations(): void {
  try {
    const filePath = join((import.meta.dirname ?? __dirname), 'translations', 'locales.json');
    if (!existsSync(filePath)) return;
    LEGACY_TRANSLATIONS = JSON.parse(readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (err) {
    log.bot.error({ err }, 'Error cargando locales.json legacy');
    LEGACY_TRANSLATIONS = { fallback: FALLBACK_LANGUAGE };
  }
}

function loadLangFile(lang: SupportedLanguage): Record<string, unknown> {
  const cached = langFileCache.get(lang);
  if (cached) return cached;

  const filePath = join((import.meta.dirname ?? __dirname), 'translations', `${lang}.json`);
  if (!existsSync(filePath)) {
    if (lang !== FALLBACK_LANGUAGE) return loadLangFile(FALLBACK_LANGUAGE);
    langFileCache.set(lang, {});
    return {};
  }

  try {
    const raw = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw) as Record<string, unknown>;
    langFileCache.set(lang, data);
    return data;
  } catch (err) {
    log.bot.error({ err, lang }, 'Error cargando archivo de idioma');
    if (lang !== FALLBACK_LANGUAGE) return loadLangFile(FALLBACK_LANGUAGE);
    langFileCache.set(lang, {});
    return {};
  }
}

function getNestedValue(obj: Record<string, unknown> | undefined, keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isLegacyLocaleMap(obj: unknown): obj is Record<string, string> {
  if (!obj || typeof obj !== 'object') return false;
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return false;
  if (!entries.every(([, v]) => typeof v === 'string')) return false;
  // locales.json leaves use language codes as keys; nested JSON sections (e.g. bot.info) do not.
  return entries.every(([k]) => k === 'fallback' || isSupportedLanguage(k));
}

function formatString(template: string, vars: Record<string, string | number> = {}): string {
  return String(template).replace(/\{(\w+)\}/g, (_, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return `{${name}}`;
  });
}

function translateFromLegacy(
  key: string,
  lang: SupportedLanguage,
  replacements?: Record<string, string | number>,
): string | null {
  let node: unknown = LEGACY_TRANSLATIONS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[part];
  }

  if (node === undefined) return null;

  let result: string;
  if (isLegacyLocaleMap(node)) {
    const fallback = (LEGACY_TRANSLATIONS.fallback as SupportedLanguage) || FALLBACK_LANGUAGE;
    result = node[lang] ?? node[fallback] ?? Object.values(node)[0] ?? key;
  } else if (typeof node === 'string') {
    result = node;
  } else {
    return null;
  }

  return replacements ? formatString(result, replacements) : result;
}

export function translate(
  key: string,
  lang: SupportedLanguage = FALLBACK_LANGUAGE,
  replacements?: Record<string, string | number>,
): string {
  const parts = key.split('.');
  let value = getNestedValue(loadLangFile(lang), parts);

  if (value === undefined && lang !== FALLBACK_LANGUAGE) {
    value = getNestedValue(loadLangFile(FALLBACK_LANGUAGE), parts);
  }

  if (typeof value === 'string') {
    return replacements ? formatString(value, replacements) : value;
  }

  const legacy = translateFromLegacy(key, lang, replacements);
  if (legacy !== null) return legacy;

  log.bot.debug({ key, lang }, 'Traducción no encontrada');
  return key;
}

function makeLeaf(node: unknown, locale: SupportedLanguage): ((vars?: Record<string, unknown>) => string) & { toString: () => string } {
  const getForLocale = (vars: Record<string, unknown> = {}) => {
    if (typeof node === 'string') return formatString(node, vars as Record<string, string | number>);
    if (isLegacyLocaleMap(node)) {
      const value = node[locale] ?? node[FALLBACK_LANGUAGE] ?? Object.values(node)[0] ?? '';
      return formatString(value, vars as Record<string, string | number>);
    }
    return '';
  };

  const fn = ((vars?: Record<string, unknown>) => getForLocale(vars ?? {})) as ((vars?: Record<string, unknown>) => string) & {
    toString: () => string;
  };
  fn.toString = () => getForLocale({});
  return fn;
}

function createProxy(node: Record<string, unknown>, locale: SupportedLanguage): unknown {
  if (typeof node === 'string' || isLegacyLocaleMap(node)) {
    return makeLeaf(node, locale);
  }

  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (prop === '_language') return locale;
        if (prop === '__raw') return node;
        if (prop === Symbol.toPrimitive) return () => '';
        if (typeof prop !== 'string') return undefined;

        const next = node[prop];
        if (next === undefined) return undefined;
        if (typeof next === 'object' && next !== null) {
          return createProxy(next as Record<string, unknown>, locale);
        }
        return makeLeaf(next, locale);
      },
      has(_, prop: string | symbol) {
        if (prop === '_language') return true;
        return typeof prop === 'string' && prop in node;
      },
    },
  );
}

async function resolveLocaleForInteraction(interaction: {
  user: { id: string };
  locale?: string | null;
  guildLocale?: string | null;
}): Promise<SupportedLanguage> {
  return getUserLanguage(interaction.user.id, interaction.locale ?? interaction.guildLocale);
}

export async function getUserLanguage(
  userId: string,
  discordLocale?: string | null,
): Promise<SupportedLanguage> {
  const cached = userLanguageCache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.lang;
  }

  if (UserLocale) {
    try {
      const user = await UserLocale.findOne({ discordId: userId }).lean().exec();
      const stored = user?.lang as string | undefined;
      if (stored && isSupportedLanguage(stored)) {
        userLanguageCache.set(userId, { lang: stored, expiry: Date.now() + USER_LANG_CACHE_TTL });
        return stored;
      }
    } catch (err) {
      log.bot.debug({ err, userId }, 'Error DB lookup para idioma');
    }
  }

  const resolved = resolveLanguage(discordLocale ?? null);
  userLanguageCache.set(userId, { lang: resolved, expiry: Date.now() + USER_LANG_CACHE_TTL });
  return resolved;
}

export function invalidateUserLanguageCache(userId: string): void {
  userLanguageCache.delete(userId);
}

export async function getTranslations(interaction: {
  user: { id: string };
  locale?: string | null;
  guildLocale?: string | null;
}): Promise<any> {
  const locale = await resolveLocaleForInteraction(interaction);
  const tree = loadLangFile(locale);
  const proxy = createProxy(tree, locale) as any;
  proxy._language = locale;
  return proxy;
}

export async function setUserLanguage(userId: string, lang: SupportedLanguage): Promise<boolean> {
  if (!UserLocale || !isSupportedLanguage(lang)) return false;

  try {
    await UserLocale.findOneAndUpdate(
      { discordId: userId },
      { lang, updatedAt: new Date() },
      { upsert: true, new: true },
    );

    userLanguageCache.set(userId, { lang, expiry: Date.now() + USER_LANG_CACHE_TTL });
    log.bot.info({ userId, lang }, 'Idioma de usuario actualizado');
    return true;
  } catch (err) {
    log.bot.error({ err, userId, lang }, 'Error estableciendo idioma');
    return false;
  }
}

export async function translateForUser(
  userId: string,
  key: string,
  replacements?: Record<string, string | number>,
  discordLocale?: string | null,
): Promise<string> {
  const lang = await getUserLanguage(userId, discordLocale);
  return translate(key, lang, replacements);
}

export async function getTranslationsForUser(userId: string): Promise<any> {
  const locale = await getUserLanguage(userId);
  const tree = loadLangFile(locale);
  const proxy = createProxy(tree, locale) as any;
  proxy._language = locale;
  return proxy;
}

/** Discord Application Command name: 1–32 chars, lowercase letters/numbers/limited scripts, _ - */
const DISCORD_SLASH_NAME_RE = /^[\p{Ll}\p{Lm}\p{Lo}\p{N}\p{sc=Devanagari}\p{sc=Thai}_-]+$/u;

function stripForDiscordSlashName(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s'"'´`~?!.,:;@#%^&*()+={}[\]|\\/<>]+/g, '')
    .replace(/[^\p{Ll}\p{Lm}\p{Lo}\p{N}\p{sc=Devanagari}\p{sc=Thai}_-]/gu, '')
    .slice(0, 32);
}

function sanitizeDiscordSlashName(text: string, key: string): string {
  let s = stripForDiscordSlashName(text);
  if (s.length >= 1 && DISCORD_SLASH_NAME_RE.test(s)) return s;

  const enRaw = translate(key, FALLBACK_LANGUAGE);
  s = stripForDiscordSlashName(enRaw === key ? 'option' : enRaw);
  if (s.length >= 1 && DISCORD_SLASH_NAME_RE.test(s)) return s;

  return 'cmd';
}

/** Discord slash names must match API constraints; descriptions max 100 chars. */
function sanitizeDiscordSlashLocalization(key: string, text: string): string {
  if (key.endsWith('.name')) {
    return sanitizeDiscordSlashName(text, key);
  }
  return text.length > 100 ? text.slice(0, 100) : text;
}

/** Build Discord slash-command localizations from all language files for a dot-path key. */
export function buildDiscordLocalizations(key: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const lang of SUPPORTED_LANGUAGES) {
    const raw = translate(key, lang);
    if (raw === key) continue;
    const text = sanitizeDiscordSlashLocalization(key, raw);

    for (const discordCode of DISCORD_LOCALE_CODES[lang]) {
      if (!DISCORD_COMMAND_LOCALES.has(discordCode)) continue;
      result[discordCode] = text;
    }
  }

  return result;
}

/** Slash command choices with localized display names (English default + Discord locale map). */
export function buildLocalizedChoices(
  nameKeyPrefix: string,
  choices: ReadonlyArray<{ value: string; name?: string }>,
): Array<{ name: string; value: string; name_localizations?: Record<string, string> }> {
  return choices.map((choice) => {
    const key = `${nameKeyPrefix}.${choice.value}`;
    const defaultName = choice.name ?? translate(key, FALLBACK_LANGUAGE);
    const nameLocalizations = buildDiscordLocalizations(key);
    return {
      name: defaultName,
      value: choice.value,
      ...(Object.keys(nameLocalizations).length > 0 ? { name_localizations: nameLocalizations } : {}),
    };
  });
}

function cleanupLanguageCache(): void {
  const now = Date.now();
  for (const [userId, data] of userLanguageCache.entries()) {
    if (data.expiry <= now) userLanguageCache.delete(userId);
  }

  if (userLanguageCache.size > 1000) {
    const entries = [...userLanguageCache.entries()].sort((a, b) => a[1].expiry - b[1].expiry);
    for (let i = 0; i < 200 && i < entries.length; i++) {
      userLanguageCache.delete(entries[i][0]);
    }
  }
}

setInterval(cleanupLanguageCache, 30 * 60 * 1000);

loadLegacyTranslations();
loadLangFile(FALLBACK_LANGUAGE);

const loadedCount = SUPPORTED_LANGUAGES.filter((lang) =>
  existsSync(join((import.meta.dirname ?? __dirname), 'translations', `${lang}.json`)),
).length;

log.bot.info({ loadedCount, fallback: FALLBACK_LANGUAGE }, 'Sistema i18n inicializado (JSON por idioma)');



