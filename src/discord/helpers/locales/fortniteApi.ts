import { getUserLanguage } from './index.ts';
import { toFortniteApiLanguage, type SupportedLanguage } from './languages.ts';

/** Resolve the user's bot language as a fortnite-api.com `language` query param. */
export async function getFortniteApiLanguageForUser(
  userId: string,
  discordLocale?: string | null,
): Promise<SupportedLanguage> {
  const lang = await getUserLanguage(userId, discordLocale);
  return toFortniteApiLanguage(lang) as SupportedLanguage;
}

export async function getFortniteApiLanguageCode(
  userId: string,
  discordLocale?: string | null,
): Promise<string> {
  return toFortniteApiLanguage(await getUserLanguage(userId, discordLocale));
}
