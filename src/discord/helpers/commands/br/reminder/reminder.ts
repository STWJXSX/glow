/**
 * Reminder BR — Helper
 *
 * Handles autocomplete and add/delete/list logic for /reminder.
 */

import axios from 'axios';
import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  stripAutocompleteLabel,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import Reminder from '#models/Reminder.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

interface BrCosmetic {
  id: string;
  name: string;
  type: string;
}

export type { BrCosmetic };

const cosmeticsCache = new Map<string, BrCosmetic[]>();
const cacheExpiry = new Map<string, number>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getAllBrCosmetics(apiLanguage: string): Promise<BrCosmetic[]> {
  const key = apiLanguage;
  const now = Date.now();

  if (cosmeticsCache.has(key) && now < (cacheExpiry.get(key) ?? 0)) {
    return cosmeticsCache.get(key)!;
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics/br', {
      params: { language: key },
      timeout: 15000,
    });

    if (response.data?.status !== 200 || !Array.isArray(response.data.data)) {
      return cosmeticsCache.get(key) ?? [];
    }

    const items: BrCosmetic[] = response.data.data
      .filter((c: any) => c.id && c.name)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type?.displayValue ?? 'Item',
      }))
      .sort((a: BrCosmetic, b: BrCosmetic) => a.name.localeCompare(b.name));

    cosmeticsCache.set(key, items);
    cacheExpiry.set(key, now + CACHE_TTL_MS);

    log.epic.debug({ count: items.length, lang: key }, '[REMINDER] Cosmetics cache updated');
    return items;
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[REMINDER] Failed to fetch BR cosmetics');
    return cosmeticsCache.get(key) ?? [];
  }
}

export async function handleReminderAddAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const lang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const query = interaction.options.getFocused(true).value.toLowerCase();

    const cosmetics = await getAllBrCosmetics(lang);

    if (cosmetics.length === 0) {
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(userId, 'reminder_cmd.autocomplete.unavailable', undefined, interaction.locale),
          ),
          value: '__unavailable__',
        },
      ]);
      return;
    }

    const filtered =
      query.length === 0
        ? cosmetics.slice(0, 25)
        : cosmetics.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 25);

    await interaction.respond(
      filtered.map((c) => ({
        name: `${c.name} (${c.type})`,
        value: c.id,
      })),
    );
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[REMINDER] Autocomplete add error');
    await interaction.respond([
      {
        name: stripAutocompleteLabel(
          await translateForUser(userId, 'reminder_cmd.autocomplete.error', undefined, interaction.locale),
        ),
        value: '__error__',
      },
    ]);
  }
}

export async function handleReminderDeleteAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const discordId = interaction.user.id;

  try {
    const query = interaction.options.getFocused(true).value.toLowerCase();

    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);

    if (!mainAccount) {
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(discordId, 'reminder_cmd.autocomplete.noMain', undefined, interaction.locale),
          ),
          value: '__none__',
        },
      ]);
      return;
    }

    const doc = await Reminder.findOne({ discordId });
    const watchedItems = doc?.accounts?.get(mainAccount.accountId)?.watchedItems ?? [];

    if (watchedItems.length === 0) {
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(discordId, 'reminder_cmd.autocomplete.noReminders', undefined, interaction.locale),
          ),
          value: '__empty__',
        },
      ]);
      return;
    }

    const choices = watchedItems
      .filter((item) => query.length === 0 || item.cosmeticName.toLowerCase().includes(query))
      .slice(0, 25)
      .map((item) => ({
        name: `${item.cosmeticName} (${item.cosmeticType})`,
        value: item.cosmeticId,
      }));

    await interaction.respond(
      choices.length > 0
        ? choices
        : [
            {
              name: stripAutocompleteLabel(
                await translateForUser(discordId, 'reminder_cmd.autocomplete.noMatch', undefined, interaction.locale),
              ),
              value: '__none__',
            },
          ],
    );
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[REMINDER] Autocomplete delete error');
    await interaction.respond([
      {
        name: stripAutocompleteLabel(
          await translateForUser(discordId, 'reminder_cmd.autocomplete.error', undefined, interaction.locale),
        ),
        value: '__error__',
      },
    ]);
  }
}

export interface BrCosmeticSearchResult {
  exact: BrCosmetic | null;
  similar: BrCosmetic[];
}

/** Search BR cosmetics by display name — exact match first, then closest names. */
export async function searchBrCosmeticsByName(
  query: string,
  apiLanguage: string,
  limit = 8,
): Promise<BrCosmeticSearchResult> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { exact: null, similar: [] };
  }

  const cosmetics = await getAllBrCosmetics(apiLanguage);
  const exact = cosmetics.find((c) => c.name.toLowerCase() === normalized) ?? null;
  if (exact) {
    return { exact, similar: [] };
  }

  const scored = cosmetics
    .map((c) => {
      const name = c.name.toLowerCase();
      let score = 0;
      if (name.includes(normalized)) score += 10;
      if (normalized.includes(name)) score += 8;
      const queryWords = normalized.split(/\s+/).filter(Boolean);
      for (const word of queryWords) {
        if (name.includes(word)) score += 3;
      }
      const distance = levenshteinRatio(normalized, name);
      score += Math.round(distance * 5);
      return { cosmetic: c, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.cosmetic.name.localeCompare(b.cosmetic.name));

  return {
    exact: null,
    similar: scored.slice(0, limit).map((entry) => entry.cosmetic),
  };
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

export async function addReminderItemForAi(
  discordId: string,
  cosmetic: BrCosmetic,
  locale: string | null,
): Promise<{ ok: boolean; text: string }> {
  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) {
      return { ok: false, text: 'No linked Epic account. Use `/login` first.' };
    }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      return { ok: false, text: 'No main Epic account set. Use `/login` and mark a main account.' };
    }

    const accountId = mainAccount.accountId;
    let doc = await Reminder.findOne({ discordId });
    if (!doc) {
      doc = new Reminder({ discordId, accounts: new Map() });
    }

    let accountEntry = doc.accounts.get(accountId);
    if (!accountEntry) {
      accountEntry = {
        isActive: true,
        accountId,
        watchedItems: [],
        createdAt: new Date(),
        lastActivity: new Date(),
      };
    }

    if (accountEntry.watchedItems.some((w) => w.cosmeticId === cosmetic.id)) {
      const msg = await translateForUser(
        discordId,
        'reminder_cmd.errors.alreadyAdded',
        { item: cosmetic.name },
        locale,
      );
      return { ok: false, text: msg };
    }

    if (accountEntry.watchedItems.length >= 50) {
      const msg = await translateForUser(discordId, 'reminder_cmd.errors.listFull', undefined, locale);
      return { ok: false, text: msg };
    }

    accountEntry.watchedItems.push({
      cosmeticId: cosmetic.id,
      cosmeticName: cosmetic.name,
      cosmeticType: cosmetic.type,
      addedAt: new Date(),
    });
    accountEntry.lastActivity = new Date();
    doc.accounts.set(accountId, accountEntry);
    doc.markModified('accounts');
    await doc.save();

    const added = await translateForUser(
      discordId,
      'reminder_cmd.add.description',
      { item: cosmetic.name, type: cosmetic.type },
      locale,
    );
    const footer = await translateForUser(
      discordId,
      'reminder_cmd.add.footer',
      { count: String(accountEntry.watchedItems.length) },
      locale,
    );

    log.epic.info({ discordId, accountId, cosmeticId: cosmetic.id }, '[REMINDER] Item added via AI');
    return { ok: true, text: `${added}\n${footer}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.epic.error({ error: msg }, '[REMINDER] AI add error');
    const generic = await translateForUser(discordId, 'reminder_cmd.errors.generic', undefined, locale);
    return { ok: false, text: generic };
  }
}

export async function deleteReminderItemForAi(
  discordId: string,
  cosmeticId: string,
  locale: string | null,
): Promise<{ ok: boolean; text: string }> {
  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      return { ok: false, text: 'No main Epic account set.' };
    }

    const accountId = mainAccount.accountId;
    const doc = await Reminder.findOne({ discordId });
    const accountEntry = doc?.accounts?.get(accountId);
    const existing = accountEntry?.watchedItems?.find((w) => w.cosmeticId === cosmeticId);

    if (!accountEntry || !existing) {
      const msg = await translateForUser(discordId, 'reminder_cmd.errors.notInList', undefined, locale);
      return { ok: false, text: msg };
    }

    accountEntry.watchedItems = accountEntry.watchedItems.filter((w) => w.cosmeticId !== cosmeticId);
    accountEntry.lastActivity = new Date();
    doc!.accounts.set(accountId, accountEntry);
    doc!.markModified('accounts');
    await doc!.save();

    const removed = await translateForUser(
      discordId,
      'reminder_cmd.delete.description',
      { item: existing.cosmeticName },
      locale,
    );
    const footer = await translateForUser(
      discordId,
      'reminder_cmd.delete.footer',
      { count: String(accountEntry.watchedItems.length) },
      locale,
    );
    return { ok: true, text: `${removed}\n${footer}` };
  } catch (err: unknown) {
    const generic = await translateForUser(discordId, 'reminder_cmd.errors.generic', undefined, locale);
    return { ok: false, text: generic };
  }
}

export async function listRemindersForAi(
  discordId: string,
  locale: string | null,
): Promise<{ ok: boolean; text: string }> {
  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      return { ok: false, text: 'No main Epic account set.' };
    }

    const doc = await Reminder.findOne({ discordId });
    const watchedItems = doc?.accounts?.get(mainAccount.accountId)?.watchedItems ?? [];

    if (watchedItems.length === 0) {
      const empty = await translateForUser(discordId, 'reminder_cmd.list.empty', undefined, locale);
      return { ok: true, text: empty };
    }

    const lines = watchedItems.map(
      (item, idx) => `${idx + 1}. **${item.cosmeticName}** (${item.cosmeticType})`,
    );
    const title = await translateForUser(discordId, 'reminder_cmd.list.title', undefined, locale);
    return { ok: true, text: `**${title}**\n${lines.join('\n')}` };
  } catch {
    const generic = await translateForUser(discordId, 'reminder_cmd.errors.generic', undefined, locale);
    return { ok: false, text: generic };
  }
}

export async function handleReminderAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const cosmeticId = interaction.options.getString('item', true);
  const discordId = interaction.user.id;
  const client = interaction.client;

  if (cosmeticId.startsWith('__')) {
    await replyEpicCustomError(interaction, discordId, 'reminder_cmd.errors.unavailable');
    return;
  }

  try {
    const lang = await getFortniteApiLanguageCode(discordId, interaction.locale);
    const cosmetics = await getAllBrCosmetics(lang);
    const cosmetic = cosmetics.find((c) => c.id === cosmeticId);

    if (!cosmetic) {
      await replyEpicCustomError(interaction, discordId, 'reminder_cmd.errors.unavailable');
      return;
    }

    const result = await addReminderItemForAi(discordId, cosmetic, interaction.locale);
    if (!result.ok) {
      await replyWithEpicEmbed(interaction, discordId, {
        style: 'info',
        description: epicEmojiLine(client, 'error', result.text),
        author: await getEpicAuthor(discordId),
        footerKey: 'brand',
      });
      return;
    }

    const author = await getEpicAuthor(discordId);
    const payload = await buildEpicReplyPayload(
      discordId,
      {
        style: 'success',
        title: await translateForUser(discordId, 'reminder_cmd.add.title', undefined, interaction.locale),
        description: epicEmojiLine(client, 'success', result.text),
        author,
        timestamp: true,
      },
      interaction,
      interaction.locale,
    );

    await interaction.editReply(payload);
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[REMINDER] Error adding item');
    await replyEpicCustomError(interaction, discordId, 'reminder_cmd.errors.generic');
  }
}

export async function handleReminderDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  const cosmeticId = interaction.options.getString('item', true);
  const discordId = interaction.user.id;
  const client = interaction.client;

  if (cosmeticId.startsWith('__')) {
    await replyEpicCustomError(interaction, discordId, 'reminder_cmd.errors.noValidItem');
    return;
  }

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);

    if (!mainAccount) {
      await replyEpicCredentialError(interaction, discordId, 'noMain');
      return;
    }

    const accountId = mainAccount.accountId;
    const doc = await Reminder.findOne({ discordId });
    const accountEntry = doc?.accounts?.get(accountId);

    const existing = accountEntry?.watchedItems?.find((w) => w.cosmeticId === cosmeticId);
    if (!accountEntry || !existing) {
      await replyWithEpicEmbed(interaction, discordId, {
        style: 'info',
        description: epicEmojiLine(
          client,
          'error',
          await translateForUser(discordId, 'reminder_cmd.errors.notInList', undefined, interaction.locale),
        ),
        author: await getEpicAuthor(discordId),
        footerKey: 'brand',
      });
      return;
    }

    const displayName = existing.cosmeticName;
    accountEntry.watchedItems = accountEntry.watchedItems.filter((w) => w.cosmeticId !== cosmeticId);
    accountEntry.lastActivity = new Date();
    doc!.accounts.set(accountId, accountEntry);
    doc!.markModified('accounts');
    await doc!.save();

    const author = await getEpicAuthor(discordId);
    const payload = await buildEpicReplyPayload(
      discordId,
      {
        style: 'info',
        title: await translateForUser(discordId, 'reminder_cmd.delete.title', undefined, interaction.locale),
        description: epicEmojiLine(
          client,
          'success',
          await translateForUser(
            discordId,
            'reminder_cmd.delete.description',
            { item: displayName },
            interaction.locale,
          ),
        ),
        author,
        footerText: await translateForUser(
          discordId,
          'reminder_cmd.delete.footer',
          { count: String(accountEntry.watchedItems.length) },
          interaction.locale,
        ),
        timestamp: true,
      },
      interaction,
      interaction.locale,
    );

    await interaction.editReply(payload);

    log.epic.info({ discordId, accountId, cosmeticId, displayName }, '[REMINDER] Item removed');
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[REMINDER] Error removing item');
    await replyEpicCustomError(interaction, discordId, 'reminder_cmd.errors.generic');
  }
}

export async function handleReminderList(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);

    if (!mainAccount) {
      await replyEpicCredentialError(interaction, discordId, 'noMain');
      return;
    }

    const accountId = mainAccount.accountId;
    const doc = await Reminder.findOne({ discordId });
    const accountEntry = doc?.accounts?.get(accountId);
    const watchedItems = accountEntry?.watchedItems ?? [];
    const author = await getEpicAuthor(discordId);
    const listTitle = await translateForUser(discordId, 'reminder_cmd.list.title', undefined, interaction.locale);

    if (watchedItems.length === 0) {
      const payload = await buildEpicReplyPayload(
        discordId,
        {
          style: 'info',
          title: listTitle,
          description: epicQuote(
            await translateForUser(discordId, 'reminder_cmd.list.empty', undefined, interaction.locale),
          ),
          author,
          footerKey: 'brand',
          timestamp: true,
        },
        interaction,
        interaction.locale,
      );
      await interaction.editReply(payload);
      return;
    }

    const lines = watchedItems.map((item, idx) =>
      epicQuote(`${idx + 1}. **${item.cosmeticName}** (${item.cosmeticType})`),
    );

    const statusLabel = accountEntry?.isActive
      ? await translateForUser(discordId, 'reminder_cmd.list.active', undefined, interaction.locale)
      : await translateForUser(discordId, 'reminder_cmd.list.inactive', undefined, interaction.locale);

    const payload = await buildEpicReplyPayload(
      discordId,
      {
        style: 'info',
        title: listTitle,
        description: [epicSection(listTitle), ...lines].join('\n'),
        author,
        footerText: await translateForUser(
          discordId,
          'reminder_cmd.list.footer',
          { count: String(watchedItems.length), status: statusLabel },
          interaction.locale,
        ),
        timestamp: true,
      },
      interaction,
      interaction.locale,
    );

    await interaction.editReply(payload);
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[REMINDER] Error listing items');
    await replyEpicCustomError(interaction, discordId, 'reminder_cmd.errors.generic');
  }
}
