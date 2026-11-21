import {
  Events,
  Message,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '#helpers/locales/languages.ts';
import { LANGUAGE_DISPLAY } from '#helpers/locales/languageDisplay.ts';
import { translateWithGoogle, protectInlineCode, restoreInlineCode } from '#helpers/discord/guild/googleTranslatePublic.ts';
import { log } from '#helpers/core/logger.ts';

const GUILD_ID = '810129117260283915';
const CHANNEL_ID = '1540362168350937118';
const AUTHOR_ID = '807586817581908008';
const REACTION_EMOJI_ID = '1467166006878404649';

const GOOGLE_LANG_CODES: Record<SupportedLanguage, string> = {
  en: 'en',
  es: 'es',
  'es-419': 'es',
  de: 'de',
  fr: 'fr',
  it: 'it',
  'pt-BR': 'pt',
  pl: 'pl',
  ru: 'ru',
  tr: 'tr',
  ja: 'ja',
  ko: 'ko',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  id: 'id',
  vi: 'vi',
  th: 'th',
  ar: 'ar',
};

/** Discord `:flag_xx:` aliases → bot language code */
const DISCORD_FLAG_TO_LANG: Record<string, SupportedLanguage> = {
  us: 'en',
  gb: 'en',
  es: 'es',
  mx: 'es-419',
  de: 'de',
  fr: 'fr',
  it: 'it',
  br: 'pt-BR',
  pl: 'pl',
  ru: 'ru',
  tr: 'tr',
  jp: 'ja',
  kr: 'ko',
  cn: 'zh-Hans',
  tw: 'zh-Hant',
  id: 'id',
  vn: 'vi',
  th: 'th',
  sa: 'ar',
  ae: 'ar',
};

const processing = new Set<string>();

function stripLeadingFlag(content: string): { body: string; sourceLang?: SupportedLanguage } {
  let body = content.trim();

  const aliasMatch = body.match(/^:flag_([a-z]{2})(?:-\d{3})?:\s*/i);
  if (aliasMatch) {
    const code = aliasMatch[1].toLowerCase();
    return {
      body: body.slice(aliasMatch[0].length).trimStart(),
      sourceLang: DISCORD_FLAG_TO_LANG[code],
    };
  }

  for (const lang of SUPPORTED_LANGUAGES) {
    const flag = LANGUAGE_DISPLAY[lang].flag;
    if (body.startsWith(flag)) {
      return {
        body: body.slice(flag.length).trimStart(),
        sourceLang: lang,
      };
    }
  }

  return { body };
}

function chunkDiscordContent(text: string, max = 2000): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  const blocks = text.split('\n\n');
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (block.length <= max) {
      current = block;
      continue;
    }

    for (let i = 0; i < block.length; i += max) {
      chunks.push(block.slice(i, i + max));
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks;
}

async function translateAnnouncement(
  body: string,
  sourceLang?: SupportedLanguage,
): Promise<Map<SupportedLanguage, string>> {
  const { safe, slots } = protectInlineCode(body);
  const googleSource = sourceLang ? GOOGLE_LANG_CODES[sourceLang] : 'auto';
  const results = new Map<SupportedLanguage, string>();

  await Promise.all(
    SUPPORTED_LANGUAGES.map(async (lang) => {
      if (sourceLang === lang) {
        results.set(lang, body);
        return;
      }

      if (sourceLang === 'es' && lang === 'es-419') {
        results.set(lang, body);
        return;
      }

      if (sourceLang === 'es-419' && lang === 'es') {
        results.set(lang, body);
        return;
      }

      try {
        const raw = await translateWithGoogle(safe, GOOGLE_LANG_CODES[lang], googleSource);
        results.set(lang, restoreInlineCode(raw, slots));
      } catch {
        results.set(lang, body);
      }
    }),
  );

  return results;
}

function buildThreadContent(translations: Map<SupportedLanguage, string>): string {
  return SUPPORTED_LANGUAGES.map((lang) => {
    const flag = LANGUAGE_DISPLAY[lang].flag;
    const text = translations.get(lang) ?? '';
    return `${flag} ${text.trim()}`;
  }).join('\n\n');
}

function buildThreadName(body: string): string {
  const line = body.split('\n')[0]?.replace(/[`>*_~]/g, '').trim() ?? '';
  return (line || 'Translations').slice(0, 100);
}

async function reactWithCustomEmoji(message: Message, client: ExtendedClient): Promise<void> {
  let emoji = client.emojis.cache.get(REACTION_EMOJI_ID);
  if (!emoji && message.guild) {
    await message.guild.emojis.fetch().catch(() => null);
    emoji = client.emojis.cache.get(REACTION_EMOJI_ID);
  }

  if (emoji) {
    await message.react(emoji).catch(() => null);
    return;
  }

  await message.react(REACTION_EMOJI_ID).catch(() => null);
}

async function handleAnnouncement(message: Message, client: ExtendedClient): Promise<void> {
  const content = message.content?.trim();
  if (!content) return;

  const { body, sourceLang } = stripLeadingFlag(content);
  if (!body) return;

  const thread = await message.startThread({
    name: buildThreadName(body),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: 'Announcement i18n thread',
  }).catch((err) => {
    log.events.error({ err, messageId: message.id }, '[ANNOUNCE_I18N] Failed to create thread');
    return null;
  });

  if (!thread) return;

  const translations = await translateAnnouncement(body, sourceLang);
  const threadText = buildThreadContent(translations);
  const chunks = chunkDiscordContent(threadText);
  let sentAny = false;

  for (const chunk of chunks) {
    const sent = await thread.send({ content: chunk }).catch((err) => {
      log.events.error({ err, threadId: thread.id }, '[ANNOUNCE_I18N] Failed to send translation chunk');
      return null;
    });
    if (sent) sentAny = true;
  }

  if (!sentAny) return;

  await reactWithCustomEmoji(message, client);
}

const event: BotEvent<'messageCreate'> = {
  name: Events.MessageCreate,

  async execute(client: ExtendedClient, message: Message) {
    if (message.author.id !== AUTHOR_ID) return;
    if (message.author.bot) return;
    if (message.guildId !== GUILD_ID) return;
    if (message.channelId !== CHANNEL_ID) return;
    if (message.hasThread || message.thread) return;

    if (processing.has(message.id)) return;
    processing.add(message.id);

    try {
      await handleAnnouncement(message, client);
    } catch (err) {
      log.events.error({ err, messageId: message.id }, '[ANNOUNCE_I18N] Unexpected error');
    } finally {
      processing.delete(message.id);
    }
  },
};

export default event;
