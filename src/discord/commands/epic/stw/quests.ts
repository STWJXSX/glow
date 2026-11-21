/**
 * COMANDO /QUESTS
 * Muestra las misiones STW de la cuenta principal, agrupadas por categoría.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Client,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getEmoji, getAppEmojiByName } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser, getUserLanguage, type SupportedLanguage } from '#helpers/locales/index.ts';
import { translateStwQuestName } from '#helpers/epic/stw/shop/stwShopTranslations.ts';
import { callCore } from '#api/glowCore.ts';
import type { StwQuestProfile } from '#helpers/commands/stw/quests/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { checkCommandPremiumRequirements, isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  getEpicAuthor,
  epicSection,
  epicQuote,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
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

const DAILY_DB: Record<string, Record<string, number>> = {
  daily_destroyarcademachines:        { quest_reactive_destroyarcade_v4: 3 },
  daily_destroybears:                 { quest_reactive_destroybear_v3: 8 },
  daily_destroyfiretrucks:            { quest_reactive_destroyfiretruck_v2: 3 },
  daily_destroygnomes:                { quest_reactive_destroygnome_v2: 3 },
  daily_destroypropanetanks:          { quest_reactive_destroypropane_v2: 10 },
  daily_destroyseesaws:               { quest_reactive_destroyseesaw_v3: 6 },
  daily_destroyserverracks:           { quest_reactive_destroyserverrack_v2: 4 },
  daily_destroytransformers:          { quest_reactive_destroytransform_v3: 2 },
  daily_destroytvs:                   { quest_reactive_destroytv_v2: 20 },
  daily_discovery_industriallocations:{ quest_reactive_discoverconstruction_v2: 3 },
  daily_discovery_rurallocations:     { quest_reactive_discoverruinedhouses_v2: 3 },
  daily_discovery_shelters:           { quest_reactive_discovershelter_v2: 4 },
  daily_discovery_suburbanlocations:  { quest_reactive_discoverfastfood_v2: 10 },
  daily_discovery_urbanlocations:     { quest_reactive_discoveremergencybuildings_v2: 8 },
  daily_explorezones:                 { complete_exploration_1: 3 },
  daily_high_priority:                { questcollect_survivoritemdata: 50 },
  daily_huskextermination_anyhero:    { kill_husk: 500 },
  daily_huskextermination_constructor:{ kill_husk_constructor_v2: 300 },
  daily_huskextermination_melee:      { kill_husk_melee: 300 },
  daily_huskextermination_ninja:      { kill_husk_ninja_v2: 300 },
  daily_huskextermination_outlander:  { kill_husk_outlander_v2: 300 },
  daily_huskextermination_ranged_assault: { kill_husk_assault: 300 },
  daily_huskextermination_ranged_pistol:  { kill_husk_pistol: 300 },
  daily_huskextermination_ranged_shotgun: { kill_husk_shotgun: 300 },
  daily_huskextermination_ranged_smg:     { kill_husk_smg: 300 },
  daily_huskextermination_ranged_sniper:  { kill_husk_sniper: 300 },
  daily_huskextermination_soldier:    { kill_husk_commando_v2: 300 },
  daily_huskextermination_trap:       { kill_husk_trap: 150 },
  daily_mission_buildradar:           { complete_buildradar_1_diff2: 4 },
  daily_mission_specialist_anyhero_1: { complete_primary: 3 },
  daily_mission_specialist_anyhero_2: { complete_primary: 5 },
  daily_mission_specialist_constructor:{ complete_constructor: 3 },
  daily_mission_specialist_ninja:     { complete_ninja: 3 },
  daily_mission_specialist_outlander: { complete_outlander: 3 },
  daily_mission_specialist_soldier:   { complete_commando: 3 },
  daily_partyof50:                    { daily_partyof50: 25 },
  daily_safes:                        { interact_safe: 1 },
  daily_treasurechests:               { interact_treasurechest: 5 },
};

const CATEGORY_ORDER = [
  'Daily', 'WeeklyQuest', 'StormKingHardmode', 'Events', 'Challenges',
  'Achievements', 'Stonewood', 'Plankerton', 'CannyValley', 'TwinePeaks',
  'Phoenix', 'Outpost', 'OnBoarding', 'Generic', 'Hero', 'HeroLoadout',
  'Armory', 'Announcements', 'PIckaxes', 'TeamPerk', 'Survivor', 'STWIrwin',
  'ReactiveQuests', 'Rewards', 'Elder', 'Others',
];

const CATEGORY_EMOJI_NAMES: Record<string, string> = {
  Daily: 'resources_specialcurrency_daily',
  WeeklyQuest: 'world_quest',
  StormKingHardmode: 'world_mini_boss',
  Events: 'currency_campaign_event_currency',
  Challenges: 'ks_icon_constructor_shielded_128',
  Achievements: 'dcboticons_success',
  Stonewood: 'difficulties_stonewood',
  Plankerton: 'difficulties_plankerton',
  CannyValley: 'difficulties_canny',
  TwinePeaks: 'difficulties_twine',
  Phoenix: 'difficulties_ventures',
  Outpost: 'world_storm_shield',
  OnBoarding: 'llamas_t_collectionbook_bang',
  Generic: 'backgrounds_generic',
  Hero: 'modifiers_gm_hero_tech_buff',
  HeroLoadout: 'con_newloadoutconfiguration_128x',
  Armory: 'resources_reagent_weapons',
  Announcements: 'dcboticons_info',
  PIckaxes: 'ingredients_nuts_bolts',
  TeamPerk: 'con_teamperk_huntersinstinct_128',
  Survivor: 'generic_genericworker_128',
  STWIrwin: 'world_beta_storm',
  ReactiveQuests: 'modifiers_ventures_escalation',
  Rewards: 'llamas_pinataminirewardpack',
  Elder: 'rks_icon_soldier_aintdoneyet_128',
  Others: 'world_question',
};

function getCategoryEmoji(client: Client, category: string): string {
  return getAppEmojiByName(client, CATEGORY_EMOJI_NAMES[category] ?? 'world_question');
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
  [/^AccountResource:reagent_promotion_heroes$/i,     '<:resources_reagent_people:1480968192091226235>'],
  [/^AccountResource:reagent_promotion_survivors$/i,  '<:resources_reagent_people:1480968192091226235>'],
  [/^AccountResource:reagent_promotion_traps$/i,      '<:resources_reagent_traps:1480968208004677826>'],
  [/^AccountResource:reagent_promotion_weapons$/i,    '<:resources_reagent_weapons:1480968210907005112>'],
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

interface QuestObjective {
  key: string;
  current: number;
  max: number | null;
}

interface QuestReward {
  templateId: string;
  quantity: number;
  emoji: string | null;
}

interface QuestEntry {
  itemId: string;
  templateId: string;
  questKey: string;
  questPool: string;
  category: string;
  name: string;
  objectives: QuestObjective[];
  canReroll: boolean;
  rewards: QuestReward[];
}

function resolveCategory(raw: string): string {
  const entry = questCatalog[raw];
  if (entry) return entry.category;
  if (raw.startsWith('daily_')) return 'Daily';
  if (raw.startsWith('wargames_') || raw.startsWith('endurancedaily_') || raw.startsWith('s11_holdfast')) return 'Events';
  if (raw.startsWith('stw_stormkinghard_weekly')) return 'WeeklyQuest';
  if (raw.startsWith('stw_stormkinghard_')) return 'StormKingHardmode';
  if (raw.startsWith('weeklyquest_')) return 'WeeklyQuest';
  if (raw.includes('stonewood')) return 'Stonewood';
  if (raw.includes('plankerton')) return 'Plankerton';
  if (raw.includes('cannyvalley')) return 'CannyValley';
  if (raw.includes('twinepeaks')) return 'TwinePeaks';
  if (raw.includes('challenge_')) return 'Challenges';
  if (raw.includes('achievement_')) return 'Achievements';
  if (raw.includes('phoenix') || raw.includes('ventures_')) return 'Phoenix';
  return 'Others';
}

function translateQuestName(questKey: string, lang: SupportedLanguage): string {
  return translateStwQuestName(questKey, lang);
}

function getQuestRewards(templateId: string): QuestReward[] {
  const rewards = rewardsIndex.get(templateId.toLowerCase());
  if (!rewards) return [];
  return rewards.map(r => ({
    templateId: r.templateId,
    quantity: r.quantity,
    emoji: getRewardEmoji(r.templateId),
  }));
}

function parseQuests(items: Record<string, any>, lang: SupportedLanguage): QuestEntry[] {
  const quests: QuestEntry[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    const tid = (item.templateId || '') as string;
    if (!tid.toLowerCase().startsWith('quest:')) continue;

    const raw = tid.replace(/^Quest:/i, '').toLowerCase();
    const attrs = item.attributes || {};
    const state = attrs.quest_state || 'Active';
    if (state === 'Claimed') continue;

    const category = resolveCategory(raw);
    const name = translateQuestName(raw, lang);
    const canReroll = raw.startsWith('daily_') || raw.startsWith('stw_stormkinghard_weekly');
    const questPool = (attrs.quest_pool || '') as string;
    const rewards = getQuestRewards(tid);

    const objectives: QuestObjective[] = [];
    const dbEntry = DAILY_DB[raw];
    const catalogEntry = questCatalog[raw];
    const completionEntries = Object.entries(attrs).filter(([k]) => k.startsWith('completion_'));

    for (const [key, val] of completionEntries) {
      const objKey = key.replace(/^completion_/, '');
      const current = Number(val) || 0;
      const max = dbEntry?.[objKey] ?? catalogEntry?.objectives?.[objKey] ?? null;
      objectives.push({ key: objKey, current, max });
    }

    if (objectives.length === 0 && dbEntry) {
      for (const [objKey, maxVal] of Object.entries(dbEntry)) {
        objectives.push({ key: objKey, current: 0, max: maxVal });
      }
    } else if (objectives.length === 0 && catalogEntry?.objectives) {
      for (const [objKey, maxVal] of Object.entries(catalogEntry.objectives)) {
        objectives.push({ key: objKey, current: 0, max: maxVal });
      }
    }

    if (category === 'Outpost' && rewards.length === 0) continue;

    quests.push({ itemId, templateId: tid, questKey: raw, questPool, category, name, objectives, canReroll, rewards });
  }

  return quests;
}

function extractDailyRerolls(profile: StwQuestProfile): number {
  return profile.questManager?.dailyQuestRerolls ?? 0;
}

function extractStormKingRerolls(profile: StwQuestProfile, questPool?: string): number {
  const poolStats: any[] = profile.questManager?.questPoolStats?.poolStats ?? [];
  const targetPool = questPool || 'weeklystormkinghardroll_01';
  const entry = poolStats.find((p: any) => p.poolName === targetPool);
  return entry?.rerollsRemaining ?? 0;
}

const QUESTS_PER_PAGE = 5;

function paginateQuests(quests: QuestEntry[], page: number): { page: number; totalPages: number; items: QuestEntry[] } {
  const totalPages = Math.max(1, Math.ceil(quests.length / QUESTS_PER_PAGE));
  const p = Math.max(1, Math.min(page, totalPages));
  const start = (p - 1) * QUESTS_PER_PAGE;
  return { page: p, totalPages, items: quests.slice(start, start + QUESTS_PER_PAGE) };
}

function progressBar(current: number, max: number): string {
  const pct = Math.min(Math.round((current / max) * 100), 100);
  const filled = Math.round(pct / 10);
  return `${'#'.repeat(filled)}${'-'.repeat(10 - filled)} ${pct}%`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View your STW quests')
    .setNameLocalizations(buildDiscordLocalizations('quests.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('quests.cmd._1'))
    .setDMPermission(true),

  auth: true,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const client = interaction.client;

    const questIcon = getAppEmojiByName(client, 'automated_quests');
    const successEmoji = getEmoji(client, 'success');
    const premiumEmoji = getEmoji(client, 'premium');

    const noQuests = await translateForUser(userId, 'quests.noQuests', undefined, locale);
    const rerollsLabel = await translateForUser(userId, 'quests.rerolls', undefined, locale);
    const rerollLabel = await translateForUser(userId, 'quests.rerollLabel', undefined, locale);
    const selectCat = await translateForUser(userId, 'quests.selectCat', undefined, locale);
    const prevLabel = await translateForUser(userId, 'quests.prev', undefined, locale);
    const nextLabel = await translateForUser(userId, 'quests.next', undefined, locale);

    const lang = await getUserLanguage(userId, locale);
    const catLabels = Object.fromEntries(
      await Promise.all(
        CATEGORY_ORDER.map(async (cat) => [
          cat,
          await translateForUser(userId, `quests.categories.${cat}`, undefined, locale),
        ]),
      ),
    );

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
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

    let allQuests: QuestEntry[];
    let dailyRerolls: number;
    let stormKingRerolls: number;
    try {
      const profile = await callCore<StwQuestProfile>('quests.view', {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      });
      allQuests = parseQuests(profile.items, lang);
      dailyRerolls = extractDailyRerolls(profile);
      const skQuest = allQuests.find(q => q.questKey.startsWith('stw_stormkinghard_weekly'));
      stormKingRerolls = extractStormKingRerolls(profile, skQuest?.questPool);
    } catch (err: unknown) {
      log.commands.error({ err }, '[quests] Failed to fetch quests');
      await replyEpicApiError(interaction, userId, err);
      return;
    }

    if (allQuests.length === 0) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'info',
        description: noQuests,
        author: authorData,
        timestamp: true,
        footerKey: 'brand',
      });
      return;
    }

    const grouped = new Map<string, QuestEntry[]>();
    for (const q of allQuests) {
      const arr = grouped.get(q.category) ?? [];
      arr.push(q);
      grouped.set(q.category, arr);
    }

    const availableCats = CATEGORY_ORDER.filter(c => grouped.has(c));
    for (const cat of grouped.keys()) {
      if (!availableCats.includes(cat)) availableCats.push(cat);
    }

    let activeCat = availableCats[0];
    let currentPage = 1;

    async function buildReply(statusLine?: string) {
      const catQuests = grouped.get(activeCat) ?? [];
      const { page, totalPages, items } = paginateQuests(catQuests, currentPage);
      currentPage = page;

      // The account is already the embed author and the category is the select menu: no header lines
      const lines: string[] = [];

      if (statusLine) {
        lines.push(statusLine, '');
      }

      if (totalPages > 1) {
        const pageText = await translateForUser(userId, 'quests.page', {
          page: String(page),
          total: String(totalPages),
        }, locale);
        lines.push(`-# ${pageText}`, '');
      }

      for (const q of items) {
        let progressText = '';
        let totalCurrent = 0;
        let totalMax = 0;
        let hasKnownMax = false;
        for (const obj of q.objectives) {
          if (obj.max !== null) {
            totalCurrent += obj.current;
            totalMax += obj.max;
            hasKnownMax = true;
          }
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
      }

      const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

      const rerollableItems = items.filter(q => q.canReroll);
      if (rerollableItems.length > 0) {
        const rerollRow = new ActionRowBuilder<ButtonBuilder>();

        for (const q of rerollableItems) {
          const globalIdx = allQuests.findIndex(x => x.itemId === q.itemId);
          const isStormKing = q.questKey.startsWith('stw_stormkinghard_weekly');
          const availableRerolls = isStormKing ? stormKingRerolls : dailyRerolls;

          const btn = new ButtonBuilder()
            .setCustomId(`quest_reroll_${globalIdx}`)
            .setLabel(q.name.substring(0, 60))
            .setStyle(isStormKing ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(availableRerolls <= 0 || (isStormKing && !isPremium));

          if (isStormKing && !isPremiumCheckBypassed()) {
            const premiumEmojiObj = (client.application as any)?.emojis?.cache?.find?.((e: any) => e.name === 'premium');
            if (premiumEmojiObj) btn.setEmoji({ id: premiumEmojiObj.id });
          }

          rerollRow.addComponents(btn);
        }

        const hasDailyRerollable = rerollableItems.some(q => q.questKey.startsWith('daily_'));
        const hasStormKingRerollable = rerollableItems.some(q => q.questKey.startsWith('stw_stormkinghard_weekly'));
        const premiumPrefix = premiumEmoji ? `${premiumEmoji} ` : '';
        let rerollInfo: string;
        if (hasDailyRerollable && hasStormKingRerollable) {
          rerollInfo = await translateForUser(userId, 'quests.rerollInfoDailyWeekly', {
            daily: String(dailyRerolls),
            weekly: String(stormKingRerolls),
            rerolls: rerollsLabel,
          }, locale);
          rerollInfo = `${questIcon} ${rerollLabel} — ${premiumPrefix}${rerollInfo}`;
        } else if (hasStormKingRerollable) {
          const weeklyInfo = await translateForUser(userId, 'quests.rerollInfoWeekly', {
            weekly: String(stormKingRerolls),
            rerolls: rerollsLabel,
          }, locale);
          rerollInfo = `${premiumPrefix}${rerollLabel} ${weeklyInfo}`;
        } else {
          const dailyInfo = await translateForUser(userId, 'quests.rerollInfoDaily', {
            daily: String(dailyRerolls),
            rerolls: rerollsLabel,
          }, locale);
          rerollInfo = `${questIcon} ${rerollLabel} ${dailyInfo}`;
        }

        lines.push('', epicQuote(rerollInfo));
        components.push(rerollRow);
      }

      if (totalPages > 1) {
        const navRow = new ActionRowBuilder<ButtonBuilder>();
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId('quest_prev')
            .setLabel(prevLabel)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
          new ButtonBuilder()
            .setCustomId('quest_next')
            .setLabel(nextLabel)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages),
        );
        components.push(navRow);
      }

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>();
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('quest_category')
        .setPlaceholder(selectCat);

      for (const cat of availableCats) {
        const label = catLabels[cat] || cat;
        const count = grouped.get(cat)?.length ?? 0;
        selectMenu.addOptions({
          label: `${label} (${count})`,
          value: cat,
          default: cat === activeCat,
        });
      }

      selectRow.addComponents(selectMenu);
      components.push(selectRow);

      const payload = await buildEpicReplyPayload(userId, {
        style: 'info',
        description: lines.join('\n'),
        author: authorData,
        timestamp: true,
        footerKey: 'brand',
      }, interaction, locale);

      return { ...payload, components };
    }

    await interaction.editReply(await buildReply());

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      idle: EPIC_PANEL_IDLE_MS,
    });

    collector.on('collect', async (btn) => {
      const cid = btn.customId;
      await btn.deferUpdate();

      if (cid === 'quest_category' && btn.isStringSelectMenu()) {
        activeCat = btn.values[0];
        currentPage = 1;
        try { await interaction.editReply(await buildReply()); } catch {}
        return;
      }

      if (cid === 'quest_prev') {
        currentPage--;
        try { await interaction.editReply(await buildReply()); } catch {}
        return;
      }
      if (cid === 'quest_next') {
        currentPage++;
        try { await interaction.editReply(await buildReply()); } catch {}
        return;
      }

      if (cid.startsWith('quest_reroll_')) {
        const idx = parseInt(cid.replace('quest_reroll_', ''), 10);
        const quest = allQuests[idx];
        if (!quest) return;

        const isStormKingQuest = quest.questKey.startsWith('stw_stormkinghard_weekly');
        if (isStormKingQuest && !isPremium) {
          const statusLine = await translateForUser(userId, 'quests.premiumRequired', undefined, locale);
          try { await interaction.editReply(await buildReply(statusLine)); } catch {}
          return;
        }

        const availableRerolls = isStormKingQuest ? stormKingRerolls : dailyRerolls;
        if (availableRerolls <= 0) {
          const statusLine = await translateEpic(
            client, userId, 'quests.noRerolls', 'error', undefined, locale,
          );
          try { await interaction.editReply(await buildReply(statusLine)); } catch {}
          return;
        }

        const rerollingLine = await translateEpic(
          client, userId, 'quests.rerolling', 'loading',
          { name: quest.name }, locale,
        );
        try {
          const loadingPayload = await buildEpicReplyPayload(userId, {
            loading: true,
            description: rerollingLine,
            author: authorData,
            footerKey: 'brand',
          }, interaction, locale);
          await interaction.editReply({ ...loadingPayload, components: [] });
        } catch {}

        try {
          const refreshed = await callCore<StwQuestProfile>('quests.reroll', {
            accountId: mainAccount!.accountId,
            accessToken: mainAccount!.accessToken,
            questItemId: quest.itemId,
          });
          allQuests = parseQuests(refreshed.items, lang);
          dailyRerolls = extractDailyRerolls(refreshed);
          const refreshedSk = allQuests.find(q => q.questKey.startsWith('stw_stormkinghard_weekly'));
          stormKingRerolls = extractStormKingRerolls(refreshed, refreshedSk?.questPool);

          grouped.clear();
          for (const q of allQuests) {
            const arr = grouped.get(q.category) ?? [];
            arr.push(q);
            grouped.set(q.category, arr);
          }

          const statusLine = await translateEpic(
            client, userId, 'quests.rerolled', 'success', undefined, locale,
          );
          try { await interaction.editReply(await buildReply(statusLine)); } catch {}
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Reroll failed';
          const statusLine = await translateEpic(
            client, userId, 'quests.errorReroll', 'error', { error: msg }, locale,
          );
          try { await interaction.editReply(await buildReply(statusLine)); } catch {}
        }
      }
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      try {
        const inactive = await translateForUser(userId, 'epic.inactivePanel', undefined, locale);
        await editReplyInactive(interaction, inactive);
      } catch {}
    });
  },
};

export default command;
