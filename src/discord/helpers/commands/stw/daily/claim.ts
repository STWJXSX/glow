/**
 * /daily claim — assign STW daily quests (main or bulk).
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  replyEpicCredentialError,
  epicEmojiLine,
  getEpicAuthor,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { callCore } from '#api/glowCore.ts';
import type { ClaimAllDailiesResult } from '#helpers/epic/stw/dailyQuestTypes.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';

async function formatClaimEntry(
  client: ChatInputCommandInteraction['client'],
  userId: string,
  locale: string | null,
  entry: ClaimAllDailiesResult,
): Promise<string> {
  const r = entry.result;

  if (r.dailyQuestsLocked) {
    const msg = await translateForUser(userId, 'dailyCmd.claim.locked', undefined, locale);
    return epicEmojiLine(client, 'warning', msg);
  }

  if (!r.success) {
    const msg = await translateForUser(userId, 'dailyCmd.claim.failed', {
      error: r.errorMessage ?? 'unknown',
    }, locale);
    return epicEmojiLine(client, 'error', msg);
  }

  if (r.newlyAssignedQuests.length > 0) {
    if (r.newlyAssignedQuests.length === 1) {
      return epicEmojiLine(client, 'success', `**${r.newlyAssignedQuests[0].name}**`);
    }
    const list = r.newlyAssignedQuests.map((q) => `• ${q.name}`).join('\n');
    return epicEmojiLine(client, 'success', list);
  }

  const existing = r.afterQuests.length ? r.afterQuests : r.beforeQuests;
  if (existing.length > 0) {
    if (existing.length === 1) {
      return `**${existing[0].name}**`;
    }
    return existing.map((q) => `• ${q.name}`).join('\n');
  }

  return await translateForUser(userId, 'dailyCmd.claim.noneActive', undefined, locale);
}

async function handleBulkDailyClaim(
  interaction: ChatInputCommandInteraction,
  lang: Awaited<ReturnType<typeof getUserLanguage>>,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const client = interaction.client;

  const loading = await buildEpicReplyPayload(
    userId,
    {
      loading: true,
      description: await translateForUser(userId, 'dailyCmd.claim.bulkProcessing', undefined, locale),
      footerKey: 'brand',
    },
    interaction,
    locale,
  );
  await interaction.editReply(loading);

  const results = await callCore<ClaimAllDailiesResult[]>('daily.claimAll', userId, lang);
  if (!results.length) {
    const payload = await buildEpicReplyPayload(
      userId,
      {
        style: 'error',
        description: await translateForUser(userId, 'dailyCmd.claim.noAccounts', undefined, locale),
        footerKey: 'brand',
      },
      interaction,
      locale,
    );
    await interaction.editReply({ ...payload, files: [] });
    return;
  }

  const fields: BulkEmbedField[] = [];
  for (const entry of results) {
    const label = buildBulkAccountLabel(client, entry.displayName, entry.isMain);
    const value = await formatClaimEntry(client, userId, locale, entry);
    fields.push({ name: label, value, inline: true });
  }

  const title = await translateForUser(userId, 'dailyCmd.claim.bulkTitle', {
    count: String(results.length),
  }, locale);
  const summary = await translateForUser(userId, 'dailyCmd.claim.bulkSummary', undefined, locale);
  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

export async function handleDailyClaim(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const client = interaction.client;
  const bulk = interaction.options.getBoolean('bulk') ?? false;
  const lang = await getUserLanguage(userId, locale);

  const user = await UsuarioInfo.findOne({ id: userId });
  if (!user?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  if (bulk) {
    if (!await guardBulkMode(interaction)) return;
    return handleBulkDailyClaim(interaction, lang);
  }

  const loading = await buildEpicReplyPayload(
    userId,
    {
      loading: true,
      description: await translateForUser(userId, 'dailyCmd.claim.processing', undefined, locale),
      footerKey: 'brand',
    },
    interaction,
    locale,
  );
  await interaction.editReply(loading);

  const results = await callCore<ClaimAllDailiesResult[]>('daily.claimMain', userId, lang);
  const lines: string[] = [];

  for (const entry of results) {
    lines.push(await formatClaimEntry(client, userId, locale, entry));
  }

  const author = await getEpicAuthor(userId);
  const payload = await buildEpicReplyPayload(
    userId,
    {
      style: 'info',
      title: await translateForUser(userId, 'dailyCmd.claim.title', undefined, locale),
      description: lines.join('\n\n') || await translateForUser(userId, 'dailyCmd.claim.noAccounts', undefined, locale),
      author,
      footerKey: 'brand',
    },
    interaction,
    locale,
  );
  await interaction.editReply({ ...payload, files: [] });
}
