/**
 * /daily reroll — manage auto-reroll unwanted quest list (premium).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { translateStwQuestName } from '#helpers/epic/stw/shop/stwShopTranslations.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  getEpicAuthor,
  replyEpicCredentialError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { editReplyInactive, EPIC_PANEL_IDLE_MS } from '#helpers/commands/epic/epicCollectorHelper.ts';
import AutoReroll from '#models/AutoReroll.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

const MAX_LIST = 25;
const IDS = { remove: 'daily_reroll:remove' } as const;

const guiaEN: Record<string, string> = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/discord/helpers/data/maps/en-US.json'), 'utf-8'),
);

export const ALL_DAILY_QUEST_KEYS: string[] = [];
for (const fullKey of Object.keys(guiaEN)) {
  if (!fullKey.startsWith('Quest:daily_')) continue;
  ALL_DAILY_QUEST_KEYS.push(fullKey.replace('Quest:', '').toLowerCase());
}
ALL_DAILY_QUEST_KEYS.sort((a, b) =>
  translateStwQuestName(a, 'en').localeCompare(translateStwQuestName(b, 'en')),
);

function getQuestName(questKey: string, lang: SupportedLanguage): string {
  return translateStwQuestName(questKey, lang);
}

type RerollStatusKind = 'success' | 'error' | 'warning';

interface RerollStatus {
  kind: RerollStatusKind;
  text: string;
}

function formatRerollStatus(
  interaction: ChatInputCommandInteraction,
  status: RerollStatus,
): string {
  const emojiKey = status.kind === 'success' ? 'success' : status.kind === 'error' ? 'error' : 'warning';
  return epicEmojiLine(interaction.client, emojiKey, status.text);
}

async function resolveMainAccount(userId: string) {
  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo?.deviceAuths?.length) return null;
  return userInfo.deviceAuths.find((a) => a.cuentaMain) ?? null;
}

async function getUnwantedQuests(userId: string, accountId: string): Promise<string[]> {
  const doc = await AutoReroll.findOne({ discordId: userId });
  return doc?.accounts?.get(accountId)?.unwantedQuests ?? [];
}

async function saveUnwantedQuests(
  userId: string,
  accountId: string,
  unwantedQuests: string[],
): Promise<void> {
  let doc = await AutoReroll.findOne({ discordId: userId });
  if (!doc) {
    doc = new AutoReroll({ discordId: userId, accounts: new Map() });
  }

  const accountData = doc.accounts.get(accountId);
  doc.accounts.set(accountId, {
    isActive: accountData?.isActive ?? true,
    accountId,
    unwantedQuests,
    createdAt: accountData?.createdAt ?? new Date(),
    lastActivity: new Date(),
  });
  doc.markModified('accounts');
  await doc.save();
}

async function buildRerollPanel(
  interaction: ChatInputCommandInteraction,
  unwanted: string[],
  status?: RerollStatus,
) {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const lang = await getUserLanguage(userId, locale);
  const author = await getEpicAuthor(userId);

  const lines: string[] = [];
  if (status) {
    lines.push(formatRerollStatus(interaction, status), '');
  }

  if (unwanted.length === 0) {
    lines.push(await translateForUser(userId, 'dailyCmd.reroll.empty', undefined, locale));
  } else {
    lines.push(await translateForUser(userId, 'dailyCmd.reroll.listHeader', undefined, locale));
    for (let i = 0; i < unwanted.length; i++) {
      lines.push(epicQuote(`${i + 1}. **${getQuestName(unwanted[i], lang)}**`));
    }
  }

  lines.push('', await translateForUser(userId, 'dailyCmd.reroll.addHint', undefined, locale));

  const footerText = unwanted.length > 0
    ? await translateForUser(userId, 'dailyCmd.reroll.count', { count: String(unwanted.length) }, locale)
    : undefined;

  const payload = await buildEpicReplyPayload(
    userId,
    {
      style: 'info',
      title: await translateForUser(userId, 'dailyCmd.reroll.title', undefined, locale),
      description: lines.join('\n'),
      author,
      footerText,
      footerKey: footerText ? undefined : 'brand',
    },
    interaction,
    locale,
  );

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (unwanted.length > 0) {
    const options = unwanted.slice(0, MAX_LIST).map((key) => {
      const label = getQuestName(key, lang);
      return new StringSelectMenuOptionBuilder()
        .setLabel(label.length > 100 ? label.slice(0, 100) : label)
        .setValue(key)
        .setDescription(key.slice(0, 100));
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(IDS.remove)
      .setPlaceholder(await translateForUser(userId, 'dailyCmd.reroll.removePlaceholder', undefined, locale))
      .addOptions(options);

    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  return { payload, components };
}

export async function handleRerollAddAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    const lang = await getUserLanguage(interaction.user.id, interaction.locale);
    const query = interaction.options.getFocused(true).value.toLowerCase();
    const userId = interaction.user.id;
    const mainAccount = await resolveMainAccount(userId);
    const doc = await AutoReroll.findOne({ discordId: userId });
    const existing = new Set(
      (mainAccount ? doc?.accounts?.get(mainAccount.accountId)?.unwantedQuests : [])?.map((q) => q.toLowerCase()) ?? [],
    );

    const available = ALL_DAILY_QUEST_KEYS.filter((key) => !existing.has(key));
    const filtered = query.length === 0
      ? available.slice(0, 25)
      : available
          .filter((key) => {
            const name = getQuestName(key, lang);
            return name.toLowerCase().includes(query) || key.includes(query);
          })
          .slice(0, 25);

    await interaction.respond(
      filtered.map((key) => ({
        name: getQuestName(key, lang).slice(0, 100),
        value: key,
        emoji: { name: 'ℹ️' },
      })),
    );
  } catch (err: unknown) {
    log.commands.error({ err }, '[DAILY-REROLL] Add autocomplete error');
    await interaction.respond([]).catch(() => {});
  }
}

export async function handleRerollRemoveAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    const lang = await getUserLanguage(interaction.user.id, interaction.locale);
    const query = interaction.options.getFocused(true).value.toLowerCase();
    const userId = interaction.user.id;
    const mainAccount = await resolveMainAccount(userId);
    const unwanted = mainAccount
      ? await getUnwantedQuests(userId, mainAccount.accountId)
      : [];

    if (unwanted.length === 0) {
      const empty = await translateForUser(userId, 'dailyCmd.reroll.empty', undefined, interaction.locale);
      await interaction.respond([{ name: empty.slice(0, 100), value: '__empty__' }]);
      return;
    }

    const items = unwanted.map((key) => ({ key, name: getQuestName(key, lang) }));
    const filtered = query.length === 0
      ? items.slice(0, 25)
      : items.filter((i) => i.name.toLowerCase().includes(query) || i.key.includes(query)).slice(0, 25);

    await interaction.respond(filtered.map((i) => ({ name: i.name.slice(0, 100), value: i.key })));
  } catch (err: unknown) {
    log.commands.error({ err }, '[DAILY-REROLL] Remove autocomplete error');
    await interaction.respond([]).catch(() => {});
  }
}

async function addQuest(
  interaction: ChatInputCommandInteraction,
  questKey: string,
): Promise<RerollStatus | null> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const lang = await getUserLanguage(userId, locale);
  const quest = questKey.toLowerCase();

  if (quest === '__empty__' || quest === '__unavailable__') return null;

  if (!ALL_DAILY_QUEST_KEYS.includes(quest)) {
    return {
      kind: 'error',
      text: await translateForUser(userId, 'dailyCmd.reroll.unknownQuest', undefined, locale),
    };
  }

  const mainAccount = await resolveMainAccount(userId);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return null;
  }

  const existing = await getUnwantedQuests(userId, mainAccount.accountId);
  if (existing.includes(quest)) {
    return {
      kind: 'warning',
      text: await translateForUser(userId, 'dailyCmd.reroll.alreadyAdded', {
        quest: getQuestName(quest, lang),
      }, locale),
    };
  }

  if (existing.length >= MAX_LIST) {
    return {
      kind: 'error',
      text: await translateForUser(userId, 'dailyCmd.reroll.listFull', undefined, locale),
    };
  }

  await saveUnwantedQuests(userId, mainAccount.accountId, [...existing, quest]);
  return {
    kind: 'success',
    text: await translateForUser(userId, 'dailyCmd.reroll.added', {
      quest: getQuestName(quest, lang),
    }, locale),
  };
}

async function removeQuest(
  interaction: ChatInputCommandInteraction,
  questKey: string,
): Promise<RerollStatus | null> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const lang = await getUserLanguage(userId, locale);
  const quest = questKey.toLowerCase();

  if (quest === '__empty__') return null;

  const mainAccount = await resolveMainAccount(userId);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return null;
  }

  const existing = await getUnwantedQuests(userId, mainAccount.accountId);
  if (!existing.includes(quest)) {
    return {
      kind: 'warning',
      text: await translateForUser(userId, 'dailyCmd.reroll.notInList', {
        quest: getQuestName(quest, lang),
      }, locale),
    };
  }

  await saveUnwantedQuests(userId, mainAccount.accountId, existing.filter((q) => q !== quest));
  return {
    kind: 'success',
    text: await translateForUser(userId, 'dailyCmd.reroll.removed', {
      quest: getQuestName(quest, lang),
    }, locale),
  };
}

async function setupRerollCollector(
  interaction: ChatInputCommandInteraction,
  accountId: string,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (componentInteraction) => {
    if (!componentInteraction.isStringSelectMenu() || componentInteraction.customId !== IDS.remove) return;
    await componentInteraction.deferUpdate();

    const questKey = componentInteraction.values[0];
    const status = await removeQuest(interaction, questKey);
    if (status === null) return;

    const refreshed = await getUnwantedQuests(userId, accountId);
    const { payload: nextPayload, components: nextComponents } = await buildRerollPanel(
      interaction,
      refreshed,
      status,
    );
    await interaction.editReply({ ...nextPayload, components: nextComponents });

    if (nextComponents.length === 0) {
      collector.stop('empty');
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'idle') return;
    const inactive = await translateForUser(userId, 'epic.inactiveConfirm', undefined, locale);
    await editReplyInactive(interaction, inactive).catch(() => {});
  });
}

export async function handleReroll(interaction: ChatInputCommandInteraction): Promise<void> {
  const addKey = interaction.options.getString('add');
  const removeKey = interaction.options.getString('remove');
  const mainAccount = await resolveMainAccount(interaction.user.id);

  if (!mainAccount) {
    await replyEpicCredentialError(interaction, interaction.user.id, 'noMain');
    return;
  }

  if (addKey) {
    const status = await addQuest(interaction, addKey);
    if (status === null) return;
    const unwanted = await getUnwantedQuests(interaction.user.id, mainAccount.accountId);
    const { payload, components } = await buildRerollPanel(interaction, unwanted, status);
    await interaction.editReply({ ...payload, components });
    if (components.length > 0) await setupRerollCollector(interaction, mainAccount.accountId);
    return;
  }

  if (removeKey) {
    const status = await removeQuest(interaction, removeKey);
    if (status === null) return;
    const unwanted = await getUnwantedQuests(interaction.user.id, mainAccount.accountId);
    const { payload, components } = await buildRerollPanel(interaction, unwanted, status);
    await interaction.editReply({ ...payload, components });
    if (components.length > 0) await setupRerollCollector(interaction, mainAccount.accountId);
    return;
  }

  await handleRerollPanel(interaction);
}

async function handleRerollPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const mainAccount = await resolveMainAccount(userId);

  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  const unwanted = await getUnwantedQuests(userId, mainAccount.accountId);
  const { payload, components } = await buildRerollPanel(interaction, unwanted);
  await interaction.editReply({ ...payload, components });

  if (components.length > 0) {
    await setupRerollCollector(interaction, mainAccount.accountId);
  }
}
