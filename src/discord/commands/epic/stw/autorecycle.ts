/**
 * COMANDO /autorecycle
 * Subcomandos: config, info
 *  - config: Configure AutoRecycle per-category (independent of /autoconfig)
 *  - info:   Show current AutoRecycle configuration
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { checkCommandPremiumRequirements, isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import AutoRecycle from '#models/AutoRecycle.ts';
import type { IRecycleCategoryConfig, RecycleRarity, RecycleCategory } from '#models/AutoRecycle.ts';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicSection,
  epicQuote,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { EPIC_NAV_IDLE_MS, editMessageInactive, editReplyInactive } from '#helpers/commands/epic/epicCollectorHelper.ts';

const CATEGORIES: { value: RecycleCategory }[] = [
  { value: 'schematics' },
  { value: 'heroes' },
  { value: 'survivors' },
  { value: 'defenders' },
];

async function rarityList(
  userId: string,
  rarities: RecycleRarity[],
  locale?: string | null,
): Promise<string> {
  const labels = await Promise.all(
    rarities.map((r) => translateForUser(userId, `autorecycle.cmd.rarities.${r}`, undefined, locale)),
  );
  return labels.join(', ');
}

async function catLabel(
  userId: string,
  cat: RecycleCategory,
  locale?: string | null,
): Promise<string> {
  return translateForUser(userId, `autorecycle.cmd.categories.${cat}`, undefined, locale);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autorecycle')
    .setDescription('Configure or view your AutoRecycle settings')
    .setNameLocalizations(buildDiscordLocalizations('autorecycle.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('autorecycle.cmd._1'))
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Configure AutoRecycle for your main account')
        .setNameLocalizations(buildDiscordLocalizations('autorecycle.cmd.config.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autorecycle.cmd._2'))
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('View your current AutoRecycle configuration')
        .setNameLocalizations(buildDiscordLocalizations('autorecycle.cmd.info.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autorecycle.cmd._3'))
    ) as unknown as SlashCommandBuilder,

  auth: true,
  cooldown: 10,
  automationSystem: 'autorecycle',

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;
    const locale = interaction.locale;

    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo || !userInfo.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, discordId, 'noCuenta');
      return;
    }

    const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, discordId, 'noMain');
      return;
    }

    if (sub === 'info') {
      await handleInfo(interaction, mainAccount, discordId);
    } else {
      await handleConfig(interaction, mainAccount, discordId);
    }
  },
};

export default command;

async function handleInfo(
  interaction: ChatInputCommandInteraction,
  mainAccount: any,
  discordId: string,
): Promise<void> {
  const client = interaction.client;
  const locale = interaction.locale;
  const accountId = mainAccount.accountId;

  const authorData = await getEpicAuthor(discordId);
  const accountName = authorData?.name ?? mainAccount.displayName;

  const doc = await AutoRecycle.findOne({ discordId });
  const accountData = doc?.accounts?.get(accountId);

  const header = await translateForUser(discordId, 'autorecycle.cmd.info.header', undefined, locale);
  const lines: string[] = [epicSection(header)];

  if (!accountData || !accountData.isActive) {
    lines.push(
      epicEmojiLine(
        client,
        'inactive',
        await translateForUser(discordId, 'autorecycle.cmd.info.notActive', { account: accountName }, locale),
      ),
    );
    await replyWithEpicEmbed(interaction, discordId, {
      style: 'info',
      title: await translateForUser(discordId, 'autorecycle.cmd.config.panelTitle', undefined, locale),
      description: lines.join('\n'),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
    return;
  }

  lines.push(
    epicEmojiLine(
      client,
      'active',
      `**${accountName}** — ${await translateForUser(discordId, 'autorecycle.cmd.info.active', undefined, locale)}`,
    ),
    '',
  );

  const allCats: { key: RecycleCategory; cfg: IRecycleCategoryConfig }[] = [
    { key: 'schematics', cfg: accountData.schematics },
    { key: 'heroes', cfg: accountData.heroes },
    { key: 'survivors', cfg: accountData.survivors },
    { key: 'defenders', cfg: accountData.defenders },
  ];

  for (const { key, cfg } of allCats) {
    const label = await catLabel(discordId, key, locale);
    if (!cfg.enabled) {
      lines.push(
        epicEmojiLine(
          client,
          'inactive',
          `**${label}** — ${await translateForUser(discordId, 'autorecycle.cmd.info.disabled', undefined, locale)}`,
        ),
      );
    } else {
      const rarities = await rarityList(discordId, cfg.rarities, locale);
      const mode = cfg.duplicatesOnly
        ? await translateForUser(discordId, 'autorecycle.cmd.config.modeDupes', undefined, locale)
        : await translateForUser(discordId, 'autorecycle.cmd.config.modeAll', undefined, locale);
      const raritiesLabel = await translateForUser(discordId, 'autorecycle.cmd.info.rarities', undefined, locale);
      const modeLabel = await translateForUser(discordId, 'autorecycle.cmd.info.mode', undefined, locale);
      lines.push(
        epicEmojiLine(client, 'active', `**${label}**`),
        epicQuote(`${raritiesLabel}: ${rarities}`),
        epicQuote(`${modeLabel}: ${mode}`),
        '',
      );
    }
  }

  const lastRun = accountData.lastActivity
    ? `<t:${Math.floor(new Date(accountData.lastActivity).getTime() / 1000)}:R>`
    : '—';
  const lastCount = accountData.lastRecycledCount ?? 0;
  const lastRunLabel = await translateForUser(discordId, 'autorecycle.cmd.info.lastRun', undefined, locale);
  const lastRecycledLabel = await translateForUser(discordId, 'autorecycle.cmd.info.lastRecycled', undefined, locale);
  const footer = await translateForUser(discordId, 'autorecycle.cmd.info.footer', undefined, locale);
  lines.push(
    epicQuote(`${lastRunLabel}: ${lastRun} | ${lastRecycledLabel}: **${lastCount}**`),
    epicQuote(footer),
  );

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'info',
    title: await translateForUser(discordId, 'autorecycle.cmd.config.panelTitle', undefined, locale),
    description: lines.join('\n'),
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}

async function handleConfig(
  interaction: ChatInputCommandInteraction,
  mainAccount: any,
  discordId: string,
): Promise<void> {
  const client = interaction.client;
  const locale = interaction.locale;
  const accountId = mainAccount.accountId;

  let isPremium = false;
  if (isPremiumCheckBypassed()) {
    isPremium = true;
  } else {
    const premiumResult = await checkCommandPremiumRequirements(
      command, discordId, interaction.guildId, interaction.client,
    );
    isPremium = premiumResult.tierLevel >= 2;
  }

  if (!isPremium) {
    await replyEpicCustomError(interaction, discordId, 'autorecycle.cmd.errors.premiumRequired');
    return;
  }

  const categoryOptions = await Promise.all(
    CATEGORIES.map(async (c) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(await translateForUser(discordId, `autorecycle.cmd.categories.${c.value}`, undefined, locale))
        .setDescription(await translateForUser(discordId, `autorecycle.cmd.categories.${c.value}_desc`, undefined, locale))
        .setValue(c.value),
    ),
  );

  const configPayload = await buildEpicReplyPayload(
    discordId,
    {
      style: 'info',
      title: await translateForUser(discordId, 'autorecycle.cmd.config.title', undefined, locale),
      description: await translateForUser(
        discordId,
        'autorecycle.cmd.config.description',
        { displayName: mainAccount.displayName },
        locale,
      ),
      footerText: await translateForUser(discordId, 'autorecycle.cmd.config.footer', undefined, locale),
    },
    interaction,
    locale,
  );

  const configMsg = await interaction.editReply({
    ...configPayload,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ar_cmd_categories')
          .setPlaceholder(await translateForUser(discordId, 'autorecycle.cmd.config.selectCategories', undefined, locale))
          .setMinValues(1)
          .setMaxValues(CATEGORIES.length)
          .addOptions(categoryOptions),
      ),
    ],
  });

  let catInteraction: StringSelectMenuInteraction;
  try {
    catInteraction = await configMsg.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === discordId && i.customId === 'ar_cmd_categories',
      idle: EPIC_NAV_IDLE_MS,
    }) as StringSelectMenuInteraction;
  } catch {
    const inactive = await translateForUser(discordId, 'epic.inactiveNav', undefined, locale);
    await editMessageInactive(configMsg, inactive);
    return;
  }

  await catInteraction.deferUpdate();
  const selectedCategories = catInteraction.values as RecycleCategory[];
  const configs: Partial<Record<RecycleCategory, IRecycleCategoryConfig>> = {};

  for (let idx = 0; idx < selectedCategories.length; idx++) {
    const catKey = selectedCategories[idx];
    const label = await catLabel(discordId, catKey, locale);
    const step = idx + 1;
    const total = selectedCategories.length;
    const stepTitle = await translateForUser(
      discordId,
      'autorecycle.cmd.config.stepTitle',
      { label, step: String(step), total: String(total) },
      locale,
    );

    const raritySelect = new StringSelectMenuBuilder()
      .setCustomId(`ar_cmd_rar_${catKey}`)
      .setPlaceholder(await translateForUser(discordId, 'autorecycle.cmd.config.selectRarities', { label }, locale))
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel(`Common (c)`).setDescription(await translateForUser(discordId, 'autorecycle.cmd.rarities.c', undefined, locale)).setValue('c'),
        new StringSelectMenuOptionBuilder().setLabel(`Uncommon (uc)`).setDescription(await translateForUser(discordId, 'autorecycle.cmd.rarities.uc', undefined, locale)).setValue('uc'),
        new StringSelectMenuOptionBuilder().setLabel(`Rare (r)`).setDescription(await translateForUser(discordId, 'autorecycle.cmd.rarities.r', undefined, locale)).setValue('r'),
        new StringSelectMenuOptionBuilder().setLabel(`Epic (vr)`).setDescription(await translateForUser(discordId, 'autorecycle.cmd.rarities.vr', undefined, locale)).setValue('vr'),
        new StringSelectMenuOptionBuilder().setLabel(`Legendary (sr)`).setDescription(await translateForUser(discordId, 'autorecycle.cmd.rarities.sr', undefined, locale)).setValue('sr'),
      );

    const rarityPayload = await buildEpicReplyPayload(
      discordId,
      {
        style: 'info',
        title: stepTitle,
        description: await translateForUser(discordId, 'autorecycle.cmd.config.rarityStep', { label }, locale),
      },
      interaction,
      locale,
    );
    await catInteraction.editReply({
      ...rarityPayload,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(raritySelect)],
    });

    let rarInteraction: StringSelectMenuInteraction;
    try {
      rarInteraction = await configMsg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === discordId && i.customId === `ar_cmd_rar_${catKey}`,
        idle: EPIC_NAV_IDLE_MS,
      }) as StringSelectMenuInteraction;
    } catch {
      const inactive = await translateForUser(discordId, 'epic.inactiveNav', undefined, locale);
      await editReplyInactive(catInteraction, inactive);
      return;
    }

    await rarInteraction.deferUpdate();
    const selectedRarities = rarInteraction.values as RecycleRarity[];

    const modeSelect = new StringSelectMenuBuilder()
      .setCustomId(`ar_cmd_mode_${catKey}`)
      .setPlaceholder(await translateForUser(discordId, 'autorecycle.cmd.config.selectMode', { label }, locale))
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(await translateForUser(discordId, 'autorecycle.cmd.config.modeAll', undefined, locale))
          .setDescription(await translateForUser(discordId, 'autorecycle.cmd.config.modeAllDesc', undefined, locale))
          .setValue('all'),
        new StringSelectMenuOptionBuilder()
          .setLabel(await translateForUser(discordId, 'autorecycle.cmd.config.modeDupes', undefined, locale))
          .setDescription(await translateForUser(discordId, 'autorecycle.cmd.config.modeDupesDesc', undefined, locale))
          .setValue('dupes'),
      );

    const modePayload = await buildEpicReplyPayload(
      discordId,
      {
        style: 'info',
        title: stepTitle,
        description: await translateForUser(
          discordId,
          'autorecycle.cmd.config.modeStep',
          { rarities: await rarityList(discordId, selectedRarities, locale), label },
          locale,
        ),
      },
      interaction,
      locale,
    );
    await rarInteraction.editReply({
      ...modePayload,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modeSelect)],
    });

    let modeInteraction: StringSelectMenuInteraction;
    try {
      modeInteraction = await configMsg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === discordId && i.customId === `ar_cmd_mode_${catKey}`,
        idle: EPIC_NAV_IDLE_MS,
      }) as StringSelectMenuInteraction;
    } catch {
      const inactive = await translateForUser(discordId, 'epic.inactiveNav', undefined, locale);
      await editReplyInactive(rarInteraction, inactive);
      return;
    }

    await modeInteraction.deferUpdate();

    configs[catKey] = {
      enabled: true,
      rarities: selectedRarities,
      duplicatesOnly: modeInteraction.values[0] === 'dupes',
    };

    catInteraction = modeInteraction as any;
  }

  const disabledConfig: IRecycleCategoryConfig = { enabled: false, rarities: [], duplicatesOnly: false };

  let doc = await AutoRecycle.findOne({ discordId });
  if (!doc) {
    doc = new AutoRecycle({ discordId, accounts: new Map() });
  }

  doc.accounts.set(accountId, {
    isActive: true,
    accountId,
    schematics: configs.schematics ?? disabledConfig,
    heroes: configs.heroes ?? disabledConfig,
    survivors: configs.survivors ?? disabledConfig,
    defenders: configs.defenders ?? disabledConfig,
    createdAt: doc.accounts.get(accountId)?.createdAt ?? new Date(),
    lastActivity: new Date(),
    lastRecycledCount: 0,
  });

  doc.markModified('accounts');
  await doc.save();

  log.commands.info({ discordId, accountId, categories: selectedCategories }, '[AUTORECYCLE] Config saved via /autorecycle config');

  const authorData = await getEpicAuthor(discordId);

  const summaryLines: string[] = [
    epicSection(await translateForUser(discordId, 'autorecycle.cmd.config.saved', undefined, locale)),
    '',
  ];

  for (const catKey of selectedCategories) {
    const cfg = configs[catKey]!;
    const label = await catLabel(discordId, catKey, locale);
    const mode = cfg.duplicatesOnly
      ? await translateForUser(discordId, 'autorecycle.cmd.config.modeDupes', undefined, locale)
      : await translateForUser(discordId, 'autorecycle.cmd.config.modeAll', undefined, locale);
    const raritiesLabel = await translateForUser(discordId, 'autorecycle.cmd.info.rarities', undefined, locale);
    const modeLabel = await translateForUser(discordId, 'autorecycle.cmd.info.mode', undefined, locale);
    summaryLines.push(
      epicEmojiLine(client, 'active', `**${label}**`),
      epicQuote(`${raritiesLabel}: ${await rarityList(discordId, cfg.rarities, locale)}`),
      epicQuote(`${modeLabel}: ${mode}`),
      '',
    );
  }

  for (const cat of CATEGORIES) {
    if (!selectedCategories.includes(cat.value)) {
      const label = await catLabel(discordId, cat.value, locale);
      summaryLines.push(
        epicEmojiLine(
          client,
          'inactive',
          `**${label}** — ${await translateForUser(discordId, 'autorecycle.cmd.info.disabled', undefined, locale)}`,
        ),
        '',
      );
    }
  }

  summaryLines.push(epicQuote(await translateForUser(discordId, 'autorecycle.cmd.info.footer', undefined, locale)));

  await replyWithEpicEmbed(interaction, discordId, {
    style: 'success',
    title: await translateForUser(discordId, 'autorecycle.cmd.config.savedTitle', undefined, locale),
    description: summaryLines.join('\n'),
    author: authorData,
    timestamp: true,
    footerKey: 'brand',
  });
}
