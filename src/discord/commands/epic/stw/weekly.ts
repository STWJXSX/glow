/**
 * COMANDO /WEEKLY
 * Shows the Storm King Hardmode weekly quest with progress and reroll button.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getEmoji, getAppEmojiByName } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser, getUserLanguage, type SupportedLanguage } from '#helpers/locales/index.ts';
import { translateStwQuestName } from '#helpers/epic/stw/shop/stwShopTranslations.ts';
import { callCore } from '#api/glowCore.ts';
import type { StwQuestProfile } from '#helpers/commands/stw/quests/types.ts';
import { checkCommandPremiumRequirements, isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import { prepareBulkAccounts, buildBulkAuthErrorField, buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  getEpicAuthor,
  epicQuote,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_NAV_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';

const questCatalog: Record<string, { category: string; image: string | null; fileName: string; objectives?: Record<string, number> }> =
  JSON.parse(readFileSync(resolve(process.cwd(), 'src/discord/helpers/data/maps/quest_catalog.json'), 'utf-8'));

const questRewardsRaw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/discord/helpers/data/maps/QuestRewards.json'), 'utf-8'));
const rewardsRows: Record<string, any> = questRewardsRaw[0]?.Rows ?? questRewardsRaw.Rows ?? {};

const rewardsIndex = new Map<string, { templateId: string; quantity: number }[]>();
for (const row of Object.values(rewardsRows) as any[]) {
  if (!row.QuestTemplateId || !row.TemplateId || row.Hidden) continue;
  const key = row.QuestTemplateId.toLowerCase();
  const arr = rewardsIndex.get(key) ?? [];
  arr.push({ templateId: row.TemplateId, quantity: row.Quantity || 1 });
  rewardsIndex.set(key, arr);
}

const REWARD_EMOJI_MAP: [RegExp, string][] = [
  [/^AccountResource:heroxp$/i,                       '<:resources_heroxp:1480968117210579205>'],
  [/^AccountResource:personnelxp$/i,                  '<:resources_personnelxp:1480968123917144206>'],
  [/^AccountResource:schematicxp$/i,                  '<:resources_schematicxp:1480968217714229428>'],
  [/^AccountResource:phoenixxp_reward$/i,             '<:resources_phoenixxp_reward:1480968130015789270>'],
  [/^AccountResource:eventcurrency_scaling$/i,        '<:resources_eventcurrency_scaling:1480968110843367556>'],
  [/^AccountResource:campaign_event_currency$/i,      '<a:currency_campaign_event_currency:1480974428765552763>'],
  [/^AccountResource:currency_mtxswap$/i,             '<:resources_currency_mtxswap:1480968101829804042>'],
  [/^AccountResource:currency_xrayllama$/i,           '<:resources_currency_xrayllama:1480968104736456894>'],
  [/^AccountResource:reagent_c_t01$/i,                '<:resources_reagent_c_t01:1480968163188277268>'],
  [/^AccountResource:reagent_c_t02$/i,                '<:resources_reagent_c_t02:1480968171493134437>'],
  [/^AccountResource:reagent_c_t03$/i,                '<:resources_reagent_c_t03:1480968174777143467>'],
  [/^AccountResource:reagent_c_t04$/i,                '<:resources_reagent_c_t04:1480968178145427509>'],
  [/^AccountResource:reagent_evolverarity_r$/i,       '<:resources_reagent_evolverarity_r:1480968182444593366>'],
  [/^AccountResource:reagent_people$/i,               '<:resources_reagent_people:1480968192091226235>'],
  [/^AccountResource:reagent_traps$/i,                '<:resources_reagent_traps:1480968208004677826>'],
  [/^AccountResource:reagent_weapons$/i,              '<:resources_reagent_weapons:1480968210907005112>'],
  [/^AccountResource:reagent_alteration/i,            '<:resources_resources:1480968214426157126>'],
  [/^AccountResource:voucher_basicpack$/i,            '<:resources_voucher_basicpack:1480968237113147586>'],
  [/^AccountResource:voucher_cardpack_bronze$/i,      '<:resources_voucher_basicpack:1480968237113147586>'],
  [/^AccountResource:voucher_cardpack_jackpot$/i,     '<:resources_voucher_basicpack:1480968237113147586>'],
  [/^AccountResource:voucher_herobuyback$/i,          '<:resources_voucher_herobuyback:1480968421452808202>'],
  [/^AccountResource:voucher_item_buyback$/i,         '<:resources_voucher_item_buyback:1480968424254341131>'],
  [/^AccountResource:voucher_generic_hero$/i,         '<:resources_voucher_generic_hero:1480968264912863334>'],
  [/^AccountResource:voucher_generic_worker$/i,       '<:resources_voucher_generic_worker:1480968399671660735>'],
  [/^AccountResource:voucher_generic_melee$/i,        '<:resources_voucher_generic_melee:1480968309133283419>'],
  [/^AccountResource:voucher_generic_ranged$/i,       '<:resources_voucher_generic_ranged:1480968330293547039>'],
  [/^AccountResource:voucher_generic_trap$/i,         '<:resources_voucher_generic_trap:1480968371158646986>'],
  [/smallxpboost_gift/i,                              '<:resources_smallxpboost_gift:1480968224827773229>'],
  [/smallxpboost/i,                                   '<:resources_smallxpboost:1480968220893511740>'],
  [/specialcurrency_daily/i,                          '<:resources_specialcurrency_daily:1480968227898134662>'],
  [/eventcurrency_candy/i,                            '<:currency_eventcurrency_candy:1480974436340596908>'],
  [/eventcurrency_snowballs/i,                        '<:currency_eventcurrency_snowballs:1480974446461325493>'],
  [/eventcurrency_spring/i,                           '<a:currency_eventcurrency_spring:1480974450047455282>'],
  [/eventcurrency_summer/i,                           '<a:currency_eventcurrency_summer:1480974453968998510>'],
  [/eventcurrency_lunar/i,                            '<:currency_eventcurrency_lunar:1480974439754764359>'],
  [/eventcurrency_roadtrip/i,                         '<:currency_eventcurrency_roadtrip:1480974443034574908>'],
];

function getRewardEmoji(templateId: string): string | null {
  for (const [re, emoji] of REWARD_EMOJI_MAP) {
    if (re.test(templateId)) return emoji;
  }
  return null;
}

interface QuestObjective { key: string; current: number; max: number | null; }
interface QuestReward { templateId: string; quantity: number; emoji: string | null; }
interface StormKingQuest {
  itemId: string;
  templateId: string;
  questKey: string;
  questPool: string;
  name: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
}

function translateQuestName(questKey: string, lang: SupportedLanguage): string {
  return translateStwQuestName(questKey, lang);
}

function getQuestRewards(templateId: string): QuestReward[] {
  const rewards = rewardsIndex.get(templateId.toLowerCase());
  if (!rewards) return [];
  return rewards.map(r => ({ templateId: r.templateId, quantity: r.quantity, emoji: getRewardEmoji(r.templateId) }));
}

function progressBar(current: number, max: number): string {
  const pct = Math.min(Math.round((current / max) * 100), 100);
  const filled = Math.round(pct / 10);
  return `${'#'.repeat(filled)}${'-'.repeat(10 - filled)} ${pct}%`;
}

function parseStormKingQuest(items: Record<string, any>, lang: SupportedLanguage): StormKingQuest | null {
  for (const [itemId, item] of Object.entries(items)) {
    const tid = (item.templateId || '') as string;
    if (!tid.toLowerCase().startsWith('quest:')) continue;
    const raw = tid.replace(/^Quest:/i, '').toLowerCase();
    if (!raw.startsWith('stw_stormkinghard_weekly')) continue;
    const attrs = item.attributes || {};
    if ((attrs.quest_state || 'Active') === 'Claimed') continue;

    const name = translateQuestName(raw, lang);
    const rewards = getQuestRewards(tid);
    const questPool = (attrs.quest_pool || '') as string;
    const objectives: QuestObjective[] = [];
    const catalogEntry = questCatalog[raw];
    const completionEntries = Object.entries(attrs).filter(([k]) => k.startsWith('completion_'));
    for (const [key, val] of completionEntries) {
      const objKey = key.replace(/^completion_/, '');
      const current = Number(val) || 0;
      const max = catalogEntry?.objectives?.[objKey] ?? null;
      objectives.push({ key: objKey, current, max });
    }
    if (objectives.length === 0 && catalogEntry?.objectives) {
      for (const [objKey, maxVal] of Object.entries(catalogEntry.objectives)) {
        objectives.push({ key: objKey, current: 0, max: maxVal });
      }
    }
    return { itemId, templateId: tid, questKey: raw, questPool, name, objectives, rewards };
  }
  return null;
}

function extractStormKingRerolls(profile: StwQuestProfile, questPool?: string): number {
  const poolStats: any[] = profile.questManager?.questPoolStats?.poolStats ?? [];
  const targetPool = questPool || 'weeklystormkinghardroll_01';
  const entry = poolStats.find((p: any) => p.poolName === targetPool);
  return entry?.rerollsRemaining ?? 0;
}

async function handleBulkWeekly(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const client = interaction.client;
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const epicEmoji = getEmoji(client, 'epic');
  const errorEmoji = getEmoji(client, 'error');
  const successEmoji = getEmoji(client, 'success');
  const lang = await getUserLanguage(userId, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);

  const mainTag = await translateForUser(userId, 'weeklyCmd.mainTag', undefined, locale);
  const noWeekly = await translateForUser(userId, 'weeklyCmd.bulkNoWeekly', undefined, locale);

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };

      try {
        const profile = await callCore<StwQuestProfile>('weekly.view', {
          accountId: account.accountId,
          accessToken: account.accessToken,
        });
        const quest = parseStormKingQuest(profile.items, lang);
        const rerolls = extractStormKingRerolls(profile, quest?.questPool);
        return { displayName: account.displayName, isMain: account.cuentaMain, quest, rerolls, error: null };
      } catch (err: any) {
        return { displayName: account.displayName, isMain: account.cuentaMain, quest: null, rerolls: 0, error: err.message ?? 'fetchFailed' };
      }
    }),
  );

  const fields: BulkEmbedField[] = [];

  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authError' in v && v.authError) {
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.displayName, v.isMain, mainTag.trim());

    if (!v.quest) {
      fields.push({
        name: label,
        value: v.error ? `${errorEmoji} \`${v.error}\`` : noWeekly,
        inline: false,
      });
      continue;
    }

    const q = v.quest;
    let totalCurrent = 0;
    let totalMax = 0;
    for (const obj of q.objectives) {
      if (obj.max !== null) { totalCurrent += obj.current; totalMax += obj.max; }
    }
    let progressText = '';
    if (totalMax > 0) {
      const pct = Math.min(Math.round((totalCurrent / totalMax) * 100), 100);
      progressText = pct >= 100
        ? ` ${successEmoji}`
        : ` (${totalCurrent}/${totalMax} — ${pct}%)`;
    }

    const rerollsLabel = await translateForUser(userId, 'weeklyCmd.rerolls', undefined, locale);
    fields.push({
      name: label,
      value: `**${q.name}**${progressText}\n${rerollsLabel}: \`${v.rerolls}\``,
      inline: false,
    });
  }

  const title = await translateForUser(
    userId,
    'weeklyCmd.bulkTitle',
    { count: String(readyAccounts.length) },
    locale,
  );
  const summary = await translateForUser(userId, 'weeklyCmd.bulkSummary', undefined, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('View your Storm King weekly quest with reroll')
    .setNameLocalizations(buildDiscordLocalizations('weekly.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('weekly.cmd._1'))
    .addBooleanOption((opt) =>
      opt
        .setName('bulk')
        .setDescription('Show weekly quest for all your accounts')
        .setNameLocalizations(buildDiscordLocalizations('weekly.cmd.options.bulk.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('weekly.cmd._2'))
        .setRequired(false)
    ) as unknown as SlashCommandBuilder,

  auth: true,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const client = interaction.client;

    const bulk = interaction.options.getBoolean('bulk') ?? false;
    if (bulk) {
      if (!await guardBulkMode(interaction)) return;
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }
      return handleBulkWeekly(interaction, user);
    }

    const weeklyIcon = getAppEmojiByName(client, 'world_quest');
    const successEmoji = getEmoji(client, 'success');
    const premiumEmoji = getEmoji(client, 'premium');

    const lang = await getUserLanguage(userId, locale);
    const title = await translateForUser(userId, 'weeklyCmd.title', undefined, locale);
    const noWeekly = await translateForUser(userId, 'weeklyCmd.noWeekly', undefined, locale);
    const rerollsLabel = await translateForUser(userId, 'weeklyCmd.rerolls', undefined, locale);
    const rerollLabel = await translateForUser(userId, 'weeklyCmd.rerollLabel', undefined, locale);

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    const mainAccount = user.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    let isPremium = false;
    if (isPremiumCheckBypassed()) {
      isPremium = true;
    } else {
      try {
        const premiumResult = await checkCommandPremiumRequirements(
          command, userId, interaction.guildId, interaction.client,
        );
        isPremium = premiumResult.hasPremium;
      } catch {}
    }

    let stormKingQuest: StormKingQuest | null;
    let rerollsRemaining: number;
    try {
      const profile = await callCore<StwQuestProfile>('weekly.view', {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      });
      stormKingQuest = parseStormKingQuest(profile.items, lang);
      rerollsRemaining = extractStormKingRerolls(profile, stormKingQuest?.questPool);
    } catch (err: unknown) {
      log.commands.error({ err }, '[weekly] Failed to fetch quests');
      await replyEpicApiError(interaction, userId, err);
      return;
    }

    async function buildReply(statusLine?: string) {
      const lines: string[] = [
        epicQuote(authorData?.name ?? mainAccount!.displayName),
      ];

      if (statusLine) {
        lines.push('', statusLine);
      }

      lines.push('');

      if (!stormKingQuest) {
        lines.push(noWeekly);
      } else {
        const q = stormKingQuest;
        let progressText = '';
        let totalCurrent = 0;
        let totalMax = 0;
        let hasKnownMax = false;
        for (const obj of q.objectives) {
          if (obj.max !== null) { totalCurrent += obj.current; totalMax += obj.max; hasKnownMax = true; }
        }
        if (hasKnownMax && totalMax > 0) {
          const pct = Math.min(Math.round((totalCurrent / totalMax) * 100), 100);
          progressText = pct >= 100
            ? ` ${successEmoji}`
            : `\n${epicQuote(`${progressBar(totalCurrent, totalMax)} (${totalCurrent}/${totalMax})`)}`;
        }

        const visibleRewards = q.rewards.filter(r => r.emoji);
        const rewardsText = visibleRewards.length > 0
          ? `\n${epicQuote(visibleRewards.map(r => `${r.emoji} x${r.quantity}`).join('  '))}`
          : '';

        lines.push(`**${q.name}**${progressText}${rewardsText}`);

        const canReroll = isPremium && rerollsRemaining > 0;
        const rerollRow = new ActionRowBuilder<ButtonBuilder>();
        const btn = new ButtonBuilder()
          .setCustomId(`weekly_reroll_${q.itemId}`)
          .setLabel(`${rerollLabel} (${rerollsRemaining} ${rerollsLabel})`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canReroll);

        const premiumEmojiObj = isPremiumCheckBypassed()
          ? null
          : (client.application as any)?.emojis?.cache?.find?.((e: any) => e.name === 'premium');
        if (premiumEmojiObj) btn.setEmoji({ id: premiumEmojiObj.id });

        rerollRow.addComponents(btn);
        const rerollPrefix = premiumEmoji ? `${premiumEmoji} ` : '';
        lines.push(
          '',
          epicQuote(`${rerollPrefix}${rerollLabel} — ${rerollsRemaining} ${rerollsLabel}`),
        );

        const payload = await buildEpicReplyPayload(userId, {
          style: 'info',
          title: `${weeklyIcon} ${title}`,
          description: lines.join('\n'),
          author: authorData,
          timestamp: true,
          footerKey: 'brand',
        }, interaction, locale);

        return { ...payload, components: [rerollRow] };
      }

      const payload = await buildEpicReplyPayload(userId, {
        style: 'info',
        title: `${weeklyIcon} ${title}`,
        description: lines.join('\n'),
        author: authorData,
        timestamp: true,
        footerKey: 'brand',
      }, interaction, locale);

      return { ...payload, components: [] };
    }

    await interaction.editReply(await buildReply());

    if (!stormKingQuest) return;

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      idle: EPIC_NAV_IDLE_MS,
    });

    collector.on('collect', async (btn) => {
      if (!btn.customId.startsWith('weekly_reroll_')) return;
      await btn.deferUpdate();

      if (!isPremium) {
        const statusLine = await translateForUser(userId, 'weeklyCmd.premiumRequired', undefined, locale);
        await interaction.editReply(await buildReply(statusLine));
        return;
      }

      if (rerollsRemaining <= 0) {
        const statusLine = await translateEpic(
          client, userId, 'weeklyCmd.noRerolls', 'error', undefined, locale,
        );
        await interaction.editReply(await buildReply(statusLine));
        return;
      }

      const rerollingLine = await translateEpic(
        client, userId, 'weeklyCmd.rerolling', 'loading',
        { name: stormKingQuest!.name }, locale,
      );
      try {
        const loadingPayload = await buildEpicReplyPayload(userId, {
          loading: true,
          title: `${weeklyIcon} ${title}`,
          description: rerollingLine,
          author: authorData,
          footerKey: 'brand',
        }, interaction, locale);
        await interaction.editReply({ ...loadingPayload, components: [] });
      } catch {}

      try {
        const refreshed = await callCore<StwQuestProfile>('weekly.reroll', {
          accountId: mainAccount.accountId,
          accessToken: mainAccount.accessToken,
          questItemId: stormKingQuest!.itemId,
        });
        stormKingQuest = parseStormKingQuest(refreshed.items, lang);
        rerollsRemaining = extractStormKingRerolls(refreshed, stormKingQuest?.questPool);

        const statusLine = await translateEpic(
          client, userId, 'weeklyCmd.rerolled', 'success', undefined, locale,
        );
        await interaction.editReply(await buildReply(statusLine));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Reroll failed';
        const statusLine = await translateEpic(
          client, userId, 'weeklyCmd.errorReroll', 'error', { error: msg }, locale,
        );
        await interaction.editReply(await buildReply(statusLine));
      }
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      try {
        const inactive = await translateForUser(userId, 'epic.inactiveNav', undefined, locale);
        await editReplyInactive(interaction, inactive);
      } catch {}
    });
  },
};

export default command;
