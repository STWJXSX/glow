/**
 * COMANDO /VBUCKS
 * Muestra información detallada de V-Bucks de la cuenta
 */

import { escapeMarkdown, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, getUserLanguage, translate } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import { refreshAllAccounts, buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { buildBulkFieldsFromText, packBulkFieldsIntoPages, sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import type { Command } from '#structures/types.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicQuote,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

type SourceType = 'giveaway' | 'complimentary' | 'purchased';
type Language = Awaited<ReturnType<typeof getUserLanguage>>;
type BotClient = ChatInputCommandInteraction['client'];

const PLATFORM_EMOJIS: Record<string, Parameters<typeof getEmoji>[1]> = {
  EpicPC: 'epic',
  PSN: 'psn',
  XBL: 'xbox',
  Nintendo: 'nintendo',
  Android: 'android',
  IOSAppStore: 'ios',
  Shared: 'vbucks',
};

interface VBucksSource {
  sourceType: SourceType;
  amount: number;
  platform?: string;
}

function classifyItem(templateId: string, platform: string, amount: number): VBucksSource {
  const type = templateId.replace('Currency:', '');
  if (type === 'MtxGiveaway') {
    return { sourceType: 'giveaway', amount };
  }
  if (type === 'MtxComplimentary') {
    return { sourceType: 'complimentary', amount, platform };
  }
  return { sourceType: 'purchased', amount, platform };
}

function sourceKey(source: VBucksSource): string {
  if (source.sourceType === 'giveaway') return 'giveaway';
  return `${source.sourceType}:${source.platform ?? 'EpicPC'}`;
}

function formatPlatform(client: BotClient, platform: string, language: Language): string {
  const key = `vbucks.platforms.${platform}`;
  const label = translate(key, language);
  return `${getEmoji(client, PLATFORM_EMOJIS[platform] ?? 'epic')} ${escapeMarkdown(label === key ? platform : label)}`;
}

function formatSourceLabel(source: VBucksSource, client: BotClient, language: Language): string {
  if (source.sourceType === 'giveaway') {
    return translate('vbucks.sources.battlepassChallenges', language);
  }
  return translate(`vbucks.sources.${source.sourceType}`, language, {
    platform: formatPlatform(client, source.platform ?? 'EpicPC', language),
  });
}

interface ParsedVBucks {
  total: number;
  sources: VBucksSource[];
  platform: string;
  giftsRemaining: number;
  creatorCode: string | null;
  refundCredits: number;
  history: Array<{ amount: number; count: number; platform: string }>;
  historyTotal: number;
}

function parseProfile(profile: any): ParsedVBucks {
  const items: Record<string, any> = profile?.items ?? {};
  const stats = profile?.stats?.attributes ?? {};

  const sourceMap = new Map<string, VBucksSource>();
  let total = 0;

  for (const item of Object.values(items) as any[]) {
    if (!item.templateId?.startsWith('Currency:Mtx')) continue;
    const qty = (item.quantity as number) ?? 0;
    const platform = (item.attributes?.platform as string) ?? 'EpicPC';
    const source = classifyItem(item.templateId, platform, qty);
    total += qty;
    const key = sourceKey(source);
    const existing = sourceMap.get(key);
    if (existing) {
      existing.amount += qty;
    } else {
      sourceMap.set(key, { ...source });
    }
  }

  const sources = [...sourceMap.values()].sort((a, b) => b.amount - a.amount);
  const platform: string = stats.current_mtx_platform ?? stats.mtx_platform ?? 'EpicPC';

  let giftsRemaining = 5;
  try {
    if (stats.allowed_to_send_gifts === false) {
      giftsRemaining = 0;
    } else {
      const giftHistory = stats.gift_history;
      const sentArr: any[] = giftHistory?.sentTo ?? giftHistory?.gifts ?? [];
      const todayStr = new Date().toDateString();
      const sentToday = sentArr.filter((g: any) => g && new Date(g.sentAt ?? g.date).toDateString() === todayStr).length;
      giftsRemaining = Math.max(0, 5 - sentToday);
    }
  } catch {
    giftsRemaining = stats.allowed_to_send_gifts ? 5 : 0;
  }

  const creatorCode: string | null = stats.mtx_affiliate ?? null;
  const refundCredits: number = stats.mtx_purchase_history?.refundCredits ?? 0;
  const purchases: any[] = stats.mtx_purchase_history?.purchases ?? [];
  const histMap = new Map<string, { amount: number; count: number; platform: string }>();

  for (const p of purchases) {
    const amount = (p.mtxQuantity ?? p.quantity ?? 0) as number;
    if (!amount) continue;
    const plt = (p.platform ?? 'EpicPC') as string;
    const key = `${amount}_${plt}`;
    const ex = histMap.get(key);
    if (ex) {
      ex.count++;
    } else {
      histMap.set(key, { amount, count: 1, platform: plt });
    }
  }

  const history = [...histMap.values()].sort((a, b) => b.amount - a.amount);
  const historyTotal = history.reduce((s, p) => s + p.amount * p.count, 0);

  return { total, sources, platform, giftsRemaining, creatorCode, refundCredits, history, historyTotal };
}

function buildVbucksEmbedInput(parsed: ParsedVBucks, client: BotClient, language: Language) {
  const formatNumber = new Intl.NumberFormat(language).format;
  const label = (key: string) => translate(`vbucks.embed.${key}`, language);
  const emojiVbucks = getEmoji(client, 'vbucks');
  const title = `${emojiVbucks} ${label('title')}`;
  const description = `## ${formatNumber(parsed.total)} V-Bucks`;
  const fields: BulkEmbedField[] = [
    { name: label('platform'), value: formatPlatform(client, parsed.platform, language), inline: true },
    { name: label('giftsRemaining'), value: `${getEmoji(client, 'gift')} **${parsed.giftsRemaining}/5**`, inline: true },
    { name: label('refunds'), value: `${getEmoji(client, 'change')} **${parsed.refundCredits}/3**`, inline: true },
  ];

  if (parsed.creatorCode) {
    fields.push({ name: label('creatorCode'), value: escapeMarkdown(parsed.creatorCode), inline: false });
  }

  const sourceLines = parsed.sources.map((source) =>
    `**${formatNumber(source.amount)}** · ${formatSourceLabel(source, client, language)}`,
  );
  fields.push(...buildBulkFieldsFromText(label('breakdown'), sourceLines.join('\n') || label('noVbucks')));

  if (parsed.history.length) {
    const historyLines = parsed.history.map(({ amount, count, platform }) =>
      `${formatPlatform(client, platform, language)} · **${formatNumber(amount)}** × ${formatNumber(count)}`,
    );
    const historyBody = [`**${formatNumber(parsed.historyTotal)} V-Bucks**`, '', ...historyLines].join('\n');
    const historyLabel = `${getEmoji(client, 'compra')} ${label('purchaseHistory')}`;
    fields.push(...buildBulkFieldsFromText(historyLabel, historyBody));
  }

  return { title, description, fields };
}

async function queryVbucks(account: IUsuarioInfo['deviceAuths'][number]): Promise<ParsedVBucks | null> {
  const data = await composeMCP({
    profile: 'common_core',
    operation: 'QueryProfile',
    accountId: account.accountId,
    accessToken: account.accessToken,
    timeout: 10000,
  });
  const profile = data.profileChanges?.find(change => change.profile)?.profile;
  return data.success && profile ? parseProfile(profile) : null;
}

async function handleBulkVbucks(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  language: Language,
): Promise<void> {
  const { user: { id: userId }, client } = interaction;
  // Token refresh already handles confirmed revocations. Keep other failed sessions visible.
  const readyAccounts = await refreshAllAccounts(user);
  if (!readyAccounts.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  const formatNumber = new Intl.NumberFormat(language).format;
  const emojiVbucks = getEmoji(client, 'vbucks');
  const sessionUnavailable = epicQuote(translate('vbucks.bulk.sessionUnavailable', language));
  const balanceUnavailable = epicQuote(translate('vbucks.bulk.balanceUnavailable', language));

  const settled = await Promise.allSettled(
    readyAccounts.map(({ account, ok }) => ok ? queryVbucks(account) : null),
  );

  let grandTotal: number | null = null;
  const balances: Array<{ name: string; total: number }> = [];
  const unavailable: BulkEmbedField[] = [];

  for (const [index, result] of settled.entries()) {
    const { account, ok } = readyAccounts[index];
    const name = buildBulkAccountLabel(client, account.displayName, account.cuentaMain);
    if (!ok) {
      unavailable.push({ name, value: sessionUnavailable, inline: true });
      continue;
    }

    if (result.status === 'rejected' || !result.value) {
      unavailable.push({ name, value: balanceUnavailable, inline: true });
      continue;
    }

    const { total } = result.value;
    grandTotal = (grandTotal ?? 0) + total;
    balances.push({ name, total });
  }

  balances.sort((a, b) => b.total - a.total);
  const fields: BulkEmbedField[] = balances.map(({ name, total }) => ({
    name,
    value: epicQuote(`${emojiVbucks} **${formatNumber(total)}**`),
    inline: true,
  }));

  const count = readyAccounts.length;
  const accountCount = translate(count === 1 ? 'vbucks.bulk.account' : 'vbucks.bulk.accounts', language, {
    count: formatNumber(count),
  });
  const total = grandTotal === null ? '—' : formatNumber(grandTotal);
  const summary = `# ${emojiVbucks} ${total} (${accountCount})`;

  await sendBulkPaginated(interaction, undefined, summary, [...fields, ...unavailable]);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('vbucks')
    .setDescription('Check your Fortnite account V-Bucks with detailed information')
    .setNameLocalizations(buildDiscordLocalizations('vbucks.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('vbucks.cmd.description'))
    .setDMPermission(true)
    .addBooleanOption(opt =>
      opt
        .setName('bulk')
        .setDescription('Show V-Bucks for all your accounts')
        .setNameLocalizations(buildDiscordLocalizations('vbucks.cmd.options.bulk.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('vbucks.cmd.options.bulk.description'))
        .setRequired(false),
    ),

  auth: true,
  nodefer: false,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    try {
      const bulk = interaction.options.getBoolean('bulk') === true;
      if (bulk && !await guardBulkMode(interaction)) return;

      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const language = await getUserLanguage(userId, interaction.locale);
      if (bulk) {
        await handleBulkVbucks(interaction, user, language);
        return;
      }

      const mainAccount = user.deviceAuths.find(acc => acc.cuentaMain);
      if (!mainAccount) {
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const authorData = await getEpicAuthor(userId, {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
      });

      const parsed = await queryVbucks(mainAccount);
      if (!parsed) {
        await replyEpicCustomError(interaction, userId, 'vbucks.errors.analyzeData');
        return;
      }

      log.epic.info({ total: parsed.total, sources: parsed.sources.length, history: parsed.history.length }, '[VBUCKS] Profile parsed');

      const embedInput = buildVbucksEmbedInput(parsed, interaction.client, language);
      const { title, description, fields } = embedInput;
      const overhead = title.length + description.length + (authorData?.name.length ?? 0) + 80;
      if (packBulkFieldsIntoPages(fields, overhead).length > 1) {
        await sendBulkPaginated(interaction, title, description, fields, 'info', authorData ?? undefined);
        return;
      }

      await replyWithEpicEmbed(interaction, userId, {
        ...embedInput,
        author: authorData,
      });
    } catch (error: unknown) {
      log.epic.error({ error }, '[VBUCKS] Error');
      await replyEpicCustomError(interaction, userId, 'epic.errors.unexpected');
    }
  },
};

export default command;
