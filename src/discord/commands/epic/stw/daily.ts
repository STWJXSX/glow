import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import {
  handleReroll,
  handleRerollAddAutocomplete,
  handleRerollRemoveAutocomplete,
} from '#helpers/commands/stw/daily/reroll.ts';
import { handleDailyClaim } from '#helpers/commands/stw/daily/claim.ts';
import { getEmoji, getAppEmojiByName } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser, getUserLanguage, type SupportedLanguage } from '#helpers/locales/index.ts';
import { translateStwQuestName } from '#helpers/epic/stw/shop/stwShopTranslations.ts';
import { callCore } from '#api/glowCore.ts';
import type { StwQuestProfile } from '#helpers/commands/stw/quests/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import { log } from '#helpers/core/logger.ts';
import { checkCommandPremiumRequirements } from '#helpers/core/client/premium.ts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyEpicApiError,
  getEpicAuthor,
  epicSection,
  epicQuote,
  translateEpic,
  epicEmojiLine,
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
interface DailyQuest {
  itemId: string;
  templateId: string;
  questKey: string;
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

function parseDailyQuests(items: Record<string, any>, lang: SupportedLanguage): DailyQuest[] {
  const quests: DailyQuest[] = [];
  for (const [itemId, item] of Object.entries(items)) {
    const tid = (item.templateId || '') as string;
    if (!tid.toLowerCase().startsWith('quest:')) continue;
    const raw = tid.replace(/^Quest:/i, '').toLowerCase();
    if (!raw.startsWith('daily_')) continue;
    const attrs = item.attributes || {};
    if ((attrs.quest_state || 'Active') === 'Claimed') continue;

    const name = translateQuestName(raw, lang);
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
    quests.push({ itemId, templateId: tid, questKey: raw, name, objectives, rewards });
  }
  return quests;
}

function extractDailyRerolls(profile: StwQuestProfile): number {
  return profile.questManager?.dailyQuestRerolls ?? 0;
}

async function ensureRerollPremium(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const premiumResult = await checkCommandPremiumRequirements(
    { automationSystem: 'autoreroll' } as Command,
    interaction.user.id,
    interaction.guildId,
    interaction.client,
  );

  if (premiumResult.allowed) return true;

  await replyEpicCustomError(
    interaction,
    interaction.user.id,
    `errors.${premiumResult.reason}`,
  );
  return false;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim, view or manage STW daily quests')
    .setNameLocalizations(buildDiscordLocalizations('daily.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('daily.cmd._1'))
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('claim')
          .setDescription('Claim your daily quests')
          .setNameLocalizations(buildDiscordLocalizations('daily.cmd.claim.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('daily.cmd._2')),
        'dailyCmd.claim.bulkOptionDescription',
      ),
    )
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('view')
          .setDescription('View your current daily quests')
          .setNameLocalizations(buildDiscordLocalizations('daily.cmd.view.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('daily.cmd._3')),
        'dailyCmd.bulk.optionDescription',
      ),
    )
    .addSubcommand(sub =>
      sub
        .setName('reroll')
        .setDescription('Manage auto-reroll unwanted daily quests (premium)')
        .setNameLocalizations(buildDiscordLocalizations('daily.cmd.reroll.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('daily.cmd._4'))
        .addStringOption(opt =>
          opt
            .setName('add')
            .setDescription('Daily quest to add to the auto-reroll list')
            .setNameLocalizations(buildDiscordLocalizations('daily.cmd.options.add.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('daily.cmd._5'))
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption(opt =>
          opt
            .setName('remove')
            .setDescription('Daily quest to remove from the auto-reroll list')
            .setNameLocalizations(buildDiscordLocalizations('daily.cmd.options.remove.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('daily.cmd._6'))
            .setRequired(false)
            .setAutocomplete(true),
        ),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 5,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);

    if (sub !== 'reroll') {
      await interaction.respond([]).catch(() => {});
      return;
    }

    const premiumResult = await checkCommandPremiumRequirements(
      { prem: true } as Command,
      interaction.user.id,
      interaction.guildId,
      interaction.client,
    );

    if (!premiumResult.allowed) {
      await interaction.respond([]).catch(() => {});
      return;
    }

    const focused = interaction.options.getFocused(true);
    if (focused.name === 'add') {
      await handleRerollAddAutocomplete(interaction);
    } else if (focused.name === 'remove') {
      await handleRerollRemoveAutocomplete(interaction);
    } else {
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'claim' || sub === 'reclamar') {
      await handleDailyClaim(interaction);
      return;
    }

    if (sub === 'view' || sub === 'ver' || sub === 'info') {
      await handleDailyView(interaction);
      return;
    }

    if (sub === 'reroll') {
      const hasPremium = await ensureRerollPremium(interaction);
      if (!hasPremium) return;
      await handleReroll(interaction);
    }
  },
};

export default command;

async function handleBulkDailyInfo(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const lang = await getUserLanguage(userId, locale);
  const noDaily = await translateForUser(userId, 'bulkMode.noDaily', undefined, locale);
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        const profile = await callCore<StwQuestProfile>('daily.view', {
          accountId: account.accountId,
          accessToken: account.accessToken,
        });
        const quests = parseDailyQuests(profile.items, lang);
        const rerolls = extractDailyRerolls(profile);
        return { account, quests, rerolls };
      } catch {
        return { account, error: true as const };
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
    const label = buildBulkAccountLabel(client, v.account.displayName, v.account.cuentaMain);
    if ('error' in v && v.error) {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', failedLabel), inline: true });
      continue;
    }
    if (!v.quests.length) {
      fields.push({ name: label, value: noDaily, inline: true });
      continue;
    }
    const line = await translateForUser(userId, 'dailyCmd.bulk.questLine', {
      quests: String(v.quests.length),
      rerolls: String(v.rerolls),
    }, locale);
    fields.push({ name: label, value: line, inline: true });
  }

  const title = await translateForUser(userId, 'dailyCmd.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'dailyCmd.bulk.summary', undefined, locale);
  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

async function handleDailyView(interaction: ChatInputCommandInteraction): Promise<void> {
  const bulk = interaction.options.getBoolean('bulk') ?? false;
  if (bulk) {
    if (!await guardBulkMode(interaction)) return;
    const userId = interaction.user.id;
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    return handleBulkDailyInfo(interaction, user);
  }

  const userId = interaction.user.id;
  const locale = interaction.locale;
  const client = interaction.client;

  const dailyIcon = getAppEmojiByName(client, 'resources_specialcurrency_daily');
  const successEmoji = getEmoji(client, 'success');

  const lang = await getUserLanguage(userId, locale);

  const title = await translateForUser(userId, 'dailyCmd.title', undefined, locale);
  const noDaily = await translateForUser(userId, 'dailyCmd.noDaily', undefined, locale);
  const rerollsLabel = await translateForUser(userId, 'dailyCmd.rerolls', undefined, locale);
  const rerollLabel = await translateForUser(userId, 'dailyCmd.rerollLabel', undefined, locale);

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

  let dailyQuests: DailyQuest[];
  let dailyRerolls: number;
  try {
    const profile = await callCore<StwQuestProfile>('daily.view', {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
    });
    dailyQuests = parseDailyQuests(profile.items, lang);
    dailyRerolls = extractDailyRerolls(profile);
  } catch (err: unknown) {
    log.commands.error({ err }, '[daily] Failed to fetch quests');
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

    if (dailyQuests.length === 0) {
      lines.push(noDaily);
    } else {
      lines.push(epicSection(title));
      for (const q of dailyQuests) {
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
      }
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (dailyQuests.length > 0) {
      const rerollRow = new ActionRowBuilder<ButtonBuilder>();
      for (const q of dailyQuests) {
        rerollRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`daily_reroll_${q.itemId}`)
            .setLabel(q.name.substring(0, 60))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(dailyRerolls <= 0),
        );
      }
      components.push(rerollRow);

      lines.push(
        '',
        epicQuote(`${dailyIcon} ${rerollLabel} (${dailyRerolls} ${rerollsLabel})`),
      );
    }

    const payload = await buildEpicReplyPayload(userId, {
      style: 'info',
      title: `${dailyIcon} ${title}`,
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
    idle: EPIC_NAV_IDLE_MS,
  });

  collector.on('collect', async (btn) => {
    if (!btn.customId.startsWith('daily_reroll_')) return;
    await btn.deferUpdate();

    const questItemId = btn.customId.replace('daily_reroll_', '');
    const quest = dailyQuests.find(q => q.itemId === questItemId);
    if (!quest) return;

    if (dailyRerolls <= 0) {
      const statusLine = await translateEpic(
        client, userId, 'dailyCmd.noRerolls', 'error', undefined, locale,
      );
      try { await interaction.editReply(await buildReply(statusLine)); } catch {}
      return;
    }

    const rerollingLine = await translateEpic(
      client, userId, 'dailyCmd.rerolling', 'loading',
      { name: quest.name }, locale,
    );
    try {
      const loadingPayload = await buildEpicReplyPayload(userId, {
        loading: true,
        title: `${dailyIcon} ${title}`,
        description: rerollingLine,
        author: authorData,
        footerKey: 'brand',
      }, interaction, locale);
      await interaction.editReply({ ...loadingPayload, components: [] });
    } catch {}

    try {
      const refreshed = await callCore<StwQuestProfile>('daily.reroll', {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        questItemId: quest.itemId,
      });
      dailyQuests = parseDailyQuests(refreshed.items, lang);
      dailyRerolls = extractDailyRerolls(refreshed);

      const statusLine = await translateEpic(
        client, userId, 'dailyCmd.rerolled', 'success', undefined, locale,
      );
      await interaction.editReply(await buildReply(statusLine));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reroll failed';
      const statusLine = await translateEpic(
        client, userId, 'dailyCmd.errorReroll', 'error', { error: msg }, locale,
      );
      try { await interaction.editReply(await buildReply(statusLine)); } catch {}
    }
  });

  collector.on('end', async (_, reason) => {
    if (!isCollectorIdle(reason)) return;
    try {
      const inactive = await translateForUser(userId, 'epic.inactiveNav', undefined, locale);
      await editReplyInactive(interaction, inactive);
    } catch {}
  });
}
