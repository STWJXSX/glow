/**
 * COMANDO /VBUCKS
 * Muestra información detallada de V-Bucks de la cuenta
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import { prepareBulkAccounts, buildBulkAuthErrorField, buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import type { Command } from '#structures/types.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicSection,
  type EpicEmbedInput,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

type SourceType = 'giveaway' | 'complimentary' | 'purchased';

interface VBucksSource {
  sourceType: SourceType;
  amount: number;
  earned: boolean;
  platform?: string;
}

function classifyItem(templateId: string, platform: string, amount: number): VBucksSource {
  const type = templateId.replace('Currency:', '');
  if (type === 'MtxGiveaway') {
    return { sourceType: 'giveaway', amount, earned: true };
  }
  if (type === 'MtxComplimentary') {
    return { sourceType: 'complimentary', amount, earned: true, platform };
  }
  return { sourceType: 'purchased', amount, earned: false, platform };
}

function sourceKey(source: VBucksSource): string {
  if (source.sourceType === 'giveaway') return 'giveaway';
  return `${source.sourceType}:${source.platform ?? 'EpicPC'}`;
}

async function translatePlatformLabel(
  userId: string,
  platform: string,
  locale: string | null,
): Promise<string> {
  const translated = await translateForUser(userId, `vbucks.platforms.${platform}`, undefined, locale);
  return translated !== `vbucks.platforms.${platform}` ? translated : platform;
}

async function formatSourceLabel(
  source: VBucksSource,
  userId: string,
  locale: string | null,
): Promise<string> {
  if (source.sourceType === 'giveaway') {
    return translateForUser(userId, 'vbucks.sources.battlepassChallenges', undefined, locale);
  }
  const pltName = await translatePlatformLabel(userId, source.platform ?? 'EpicPC', locale);
  if (source.sourceType === 'complimentary') {
    return translateForUser(userId, 'vbucks.sources.complimentary', { platform: pltName }, locale);
  }
  return translateForUser(userId, 'vbucks.sources.purchased', { platform: pltName }, locale);
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

async function buildVbucksEmbedInput(
  parsed: ParsedVBucks,
  userId: string,
  client: ChatInputCommandInteraction['client'],
  locale: string | null,
): Promise<EpicEmbedInput> {
  const emojiVbucks = getEmoji(client, 'vbucks');
  const emojiPurchase = getEmoji(client, 'compra');
  const emojiPsn = getEmoji(client, 'psn');
  const emojiXbox = getEmoji(client, 'xbox');
  const emojiNintendo = getEmoji(client, 'nintendo');
  const emojiAndroid = getEmoji(client, 'android');
  const emojiIos = getEmoji(client, 'ios');
  const emojiEpic = getEmoji(client, 'epic');
  const emojiGift = getEmoji(client, 'gift');
  const emojiRefund = getEmoji(client, 'change');

  const PLATFORM_EMOJI: Record<string, string> = {
    EpicPC: emojiEpic,
    PSN: emojiPsn,
    XBL: emojiXbox,
    Nintendo: emojiNintendo,
    Android: emojiAndroid,
    IOSAppStore: emojiIos,
    Shared: emojiVbucks,
  };

  const trans: Record<string, string> = {
    total: await translateForUser(userId, 'vbucks.embed.total', undefined, locale),
    platform: await translateForUser(userId, 'vbucks.embed.platform', undefined, locale),
    giftsRemaining: await translateForUser(userId, 'vbucks.embed.giftsRemaining', undefined, locale),
    creatorCode: await translateForUser(userId, 'vbucks.embed.creatorCode', undefined, locale),
    refunds: await translateForUser(userId, 'vbucks.embed.refunds', undefined, locale),
    breakdown: await translateForUser(userId, 'vbucks.embed.breakdown', undefined, locale),
    noVbucks: await translateForUser(userId, 'vbucks.embed.noVbucks', undefined, locale),
    purchaseHistory: await translateForUser(userId, 'vbucks.embed.purchaseHistory', undefined, locale),
  };

  const platformLabel = await translatePlatformLabel(userId, parsed.platform, locale);
  const pltEmoji = PLATFORM_EMOJI[parsed.platform] ?? emojiEpic;
  const fields: EpicEmbedInput['fields'] = [
    { name: `${emojiVbucks} ${epicSection(trans.total)}`, value: `**${parsed.total.toLocaleString()}**`, inline: true },
    { name: `${pltEmoji} ${epicSection(trans.platform)}`, value: `\`${platformLabel}\``, inline: true },
    { name: `${emojiGift} ${epicSection(trans.giftsRemaining)}`, value: `**${parsed.giftsRemaining}/5**`, inline: true },
    { name: epicSection(trans.creatorCode), value: parsed.creatorCode ? `\`${parsed.creatorCode}\`` : '`—`', inline: true },
    { name: `${emojiRefund} ${epicSection(trans.refunds)}`, value: `**${parsed.refundCredits}/3**`, inline: true },
    { name: '\u200b', value: '\u200b', inline: true },
  ];

  if (parsed.sources.length > 0) {
    const lines = await Promise.all(
      parsed.sources.map(async (s) => {
        const srcEmoji = s.earned
          ? emojiVbucks
          : (s.platform ? (PLATFORM_EMOJI[s.platform] ?? emojiVbucks) : emojiVbucks);
        const label = await formatSourceLabel(s, userId, locale);
        return `${srcEmoji} **${s.amount.toLocaleString()}** — ${label}`;
      }),
    );
    fields.push({ name: epicSection(trans.breakdown), value: lines.join('\n'), inline: false });
  } else {
    fields.push({ name: epicSection(trans.breakdown), value: trans.noVbucks, inline: false });
  }

  if (parsed.history.length > 0) {
    for (const p of parsed.history) {
      const pltLabel = await translatePlatformLabel(userId, p.platform, locale);
      fields.push({
        name: `${emojiPurchase} ${pltLabel}`,
        value: `**${p.amount.toLocaleString()}** × ${p.count}`,
        inline: true,
      });
    }
    fields.push({
      name: `${emojiVbucks} ${epicSection(trans.purchaseHistory)}`,
      value: `**${parsed.historyTotal.toLocaleString()}**`,
      inline: false,
    });
  }

  return {
    style: 'info',
    fields,
    footerKey: 'brand',
  };
}

async function handleBulkVbucks(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const emojiVbucks = getEmoji(client, 'vbucks');
  const emojiEpic = getEmoji(client, 'epic');
  const emojiError = getEmoji(client, 'error');
  const emojiGift = getEmoji(client, 'gift');

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  if (!readyAccounts.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  type AccResult = {
    displayName: string;
    isMain: boolean;
    total: number;
    platform: string;
    gifts: number;
    error: string | null;
  };

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }): Promise<AccResult | { authField: true; account: IUsuarioInfo['deviceAuths'][number]; error?: string }> => {
      if (!ok) {
        return { authField: true, account, error: authErr };
      }

      const data = await composeMCP({ profile: 'common_core', operation: 'QueryProfile', accountId: account.accountId, accessToken: account.accessToken });
      const profile = data?.profileChanges?.[0]?.profile;
      const parsed = parseProfile(profile);

      return { displayName: account.displayName, isMain: account.cuentaMain, total: parsed.total, platform: parsed.platform, gifts: parsed.giftsRemaining, error: null };
    }),
  );

  let grandTotal = 0;
  const fields: BulkEmbedField[] = [];

  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authField' in v && v.authField) {
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const acc = v as AccResult;
    const label = buildBulkAccountLabel(client, acc.displayName, acc.isMain);
    if (acc.error) {
      fields.push({ name: label, value: `${emojiError} ${acc.error}`, inline: true });
    } else {
      grandTotal += acc.total;
      const platformLabel = acc.platform ? await translatePlatformLabel(userId, acc.platform, locale) : acc.platform;
      fields.push({
        name: label,
        value: `${emojiVbucks} **${acc.total.toLocaleString()}**\n\`${platformLabel}\` · ${emojiGift} \`${acc.gifts}/5\``,
        inline: true,
      });
    }
  }

  const title = await translateForUser(userId, 'vbucks.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'vbucks.bulk.summary', {
    total: `${grandTotal.toLocaleString()} ${emojiVbucks}`,
  }, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'info');
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
    const locale = interaction.locale;

    const bulk = interaction.options.getBoolean('bulk') ?? false;
    if (bulk) {
      if (!await guardBulkMode(interaction)) return;
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }
      return handleBulkVbucks(interaction, user);
    }

    try {
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
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

      const data = await composeMCP({
        profile: 'common_core',
        operation: 'QueryProfile',
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      });

      const profile = data?.profileChanges?.[0]?.profile;
      if (!profile) {
        await replyEpicCustomError(interaction, userId, 'vbucks.errors.analyzeData');
        return;
      }

      const parsed = parseProfile(profile);
      log.epic.info({ total: parsed.total, sources: parsed.sources.length, history: parsed.history.length }, '[VBUCKS] Profile parsed');

      const embedInput = await buildVbucksEmbedInput(parsed, userId, interaction.client, locale);
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
