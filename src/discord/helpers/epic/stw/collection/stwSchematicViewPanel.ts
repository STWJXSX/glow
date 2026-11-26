import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  type InteractionEditReplyOptions,
} from 'discord.js';
import { existsSync } from 'fs';
import path from 'path';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { translateItemName } from '#helpers/locales/gameTranslations.ts';
import { getStwPowerLevel } from '../gameplay/stwPowerLevel.ts';
import {
  loadStwAssetCatalogs,
  resolveStwItemIcon,
  resolveStwSchematicIconRemoteUrl,
} from '../shop/stwShopAssets.ts';
import {
  buildEpicReplyPayload,
  epicSection,
  epicEmojiLine,
  getEpicAuthor,
  replyEpicCustomError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import type { CampaignSchematicItem, SchematicCategory } from './stwCampaignSchematics.ts';
import {
  EVOLUTION_EMOJI,
  listRespecPerkOptions,
  parseSchematicPerks,
  perkTierEmoji,
} from './stwSchematicAlterations.ts';
import {
  canEvolveSchematicRarity,
  getMaxGameLevel,
} from './stwSchematicUpgradeLogic.ts';
import {
  reloadSchematic,
  respecSchematicPerk,
  schematicNeedsEvolutionChoice,
  upgradeSchematicPerk,
  upgradeSchematicRarity,
  upgradeSchematicToMax,
  type SchematicAccountContext,
} from './stwSchematicActions.ts';

/** Per-weapon respec catalog not implemented yet — keep modify UI off. */
const PERKS_MODIFY_ENABLED = false;

const HERO_RARITY_EMOJI_KEY: Record<string, string> = {
  c: 'hero_c',
  uc: 'hero_uc',
  r: 'hero_r',
  vr: 'hero_vr',
  sr: 'hero_sr',
  ur: 'hero_er',
  er: 'hero_er',
};

const WEAPON_RARITY_EMOJI_KEY: Record<string, string> = {
  c: 'weapon_c',
  uc: 'weapon_uc',
  r: 'weapon_r',
  vr: 'weapon_vr',
  sr: 'weapon_sr',
  ur: 'weapon_sr',
  er: 'weapon_sr',
};

const TRAP_RARITY_EMOJI_KEY: Record<string, string> = {
  c: 'trap_c',
  uc: 'trap_uc',
  r: 'trap_r',
  vr: 'trap_vr',
  sr: 'trap_sr',
  ur: 'trap_sr',
  er: 'trap_sr',
};

type PanelMode = 'main' | 'perks' | 'perk_upgrade' | 'evolution';

interface PanelState {
  mode: PanelMode;
  respecSlot: number | null;
}

function prefix(interactionId: string): string {
  return `stw_sch_view_${interactionId}`;
}

function schematicRarityEmoji(
  client: ChatInputCommandInteraction['client'],
  schematic: CampaignSchematicItem,
): string {
  const map =
    schematic.category === 'trap'
      ? TRAP_RARITY_EMOJI_KEY
      : schematic.category === 'weapon'
        ? WEAPON_RARITY_EMOJI_KEY
        : HERO_RARITY_EMOJI_KEY;
  const fallback =
    schematic.category === 'trap'
      ? 'trap_r'
      : schematic.category === 'weapon'
        ? 'weapon_r'
        : 'hero_c';
  const key = map[schematic.rarity] ?? fallback;
  return (getEmoji(client, key as any) as string) ?? '';
}

function splitPerksForDisplay(
  perks: ReturnType<typeof parseSchematicPerks>,
  category: SchematicCategory,
): { main: ReturnType<typeof parseSchematicPerks>; passive: (typeof perks)[number] | null } {
  const filled = perks.filter((perk) => perk.alterationId);
  if (category !== 'weapon') return { main: filled, passive: null };

  const passive = filled.find((perk) => perk.isGameplay) ?? null;
  if (!passive) return { main: filled, passive: null };

  return {
    main: filled.filter((perk) => perk !== passive),
    passive,
  };
}

function powerEmoji(client: ChatInputCommandInteraction['client']): string {
  return (getEmoji(client, 'stw_power' as any) as string)
    || (getEmoji(client, 'rayo' as any) as string)
    || '⚡';
}

function resolveSchematicThumbnail(schematic: CampaignSchematicItem): {
  thumbnail?: string;
  files: AttachmentBuilder[];
} {
  const iconPath = resolveStwItemIcon(schematic.templateId, loadStwAssetCatalogs());
  if (iconPath && existsSync(iconPath)) {
    const ext = path.extname(iconPath) || '.png';
    const name = `schematic_thumb${ext}`;
    return {
      thumbnail: `attachment://${name}`,
      files: [new AttachmentBuilder(iconPath, { name })],
    };
  }

  const remote = resolveStwSchematicIconRemoteUrl(schematic.templateId);
  return {
    thumbnail: remote ?? undefined,
    files: [],
  };
}

async function buildDescription(
  schematic: CampaignSchematicItem,
  userId: string,
  locale: string | null,
  client: ChatInputCommandInteraction['client'],
  mode: PanelMode,
): Promise<string> {
  const lines: string[] = [];

  if (mode === 'perks' || mode === 'perk_upgrade' || mode === 'main') {
    const perksNote = await translateForUser(userId, 'schematics.view.perksNote', undefined, locale);
    if (perksNote && perksNote !== 'schematics.view.perksNote') {
      lines.push(epicEmojiLine(client, 'importante', perksNote));
    }

    const perksHeader = await translateForUser(userId, 'schematics.view.perksHeader', undefined, locale);
    lines.push(epicSection(perksHeader));

    const perks = parseSchematicPerks(
      schematic.alterationDefinitions,
      schematic.alterationBaseRarities,
    );
    const { main, passive } = splitPerksForDisplay(perks, schematic.category);

    for (const perk of main) {
      lines.push(`${perk.lineEmoji} ${perk.displayName}`);
    }

    if (passive) {
      lines.push('');
      lines.push(`${passive.lineEmoji} ${passive.displayName}`);
    }
  }

  if (mode === 'evolution') {
    lines.push('');
    lines.push(
      await translateForUser(userId, 'schematics.view.evolutionPrompt', undefined, locale),
    );
  }

  return lines.join('\n');
}

async function buildComponents(
  interactionId: string,
  schematic: CampaignSchematicItem,
  state: PanelState,
  userId: string,
  locale: string | null,
  lang: SupportedLanguage,
  disabled = false,
): Promise<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]> {
  const p = prefix(interactionId);
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (state.mode === 'evolution') {
    const evoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${p}_evo_0`)
        .setLabel(await translateForUser(userId, 'schematics.view.buttons.rayosol', undefined, locale))
        .setEmoji(EVOLUTION_EMOJI.rayosol.match(/:(\d+)>$/)?.[1] ?? '1364575464793837640')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`${p}_evo_1`)
        .setLabel(await translateForUser(userId, 'schematics.view.buttons.radiantita', undefined, locale))
        .setEmoji(EVOLUTION_EMOJI.radiantita.match(/:(\d+)>$/)?.[1] ?? '1364575466228285500')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`${p}_cancel_evo`)
        .setLabel(await translateForUser(userId, 'schematics.view.buttons.cancel', undefined, locale))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    );
    rows.push(evoRow);
    return rows;
  }

  const mainRow = new ActionRowBuilder<ButtonBuilder>();

  if (canEvolveSchematicRarity(schematic.rarity)) {
    mainRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${p}_rarity`)
        .setLabel(await translateForUser(userId, 'schematics.view.buttons.upgradeRarity', undefined, locale))
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
    );
  }

  const perks = parseSchematicPerks(
    schematic.alterationDefinitions,
    schematic.alterationBaseRarities,
  );
  const hasUpgradeablePerks = perks.some((pk) => pk.canUpgrade);

  const atMax = schematic.level >= getMaxGameLevel(schematic.rarity);
  mainRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${p}_max`)
      .setLabel(await translateForUser(userId, 'schematics.view.buttons.maxUpgrade', undefined, locale))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || atMax),
    new ButtonBuilder()
      .setCustomId(`${p}_perk_upgrade`)
      .setLabel(
        state.mode === 'perk_upgrade'
          ? await translateForUser(userId, 'schematics.view.buttons.hideUpgradePerks', undefined, locale)
          : await translateForUser(userId, 'schematics.view.buttons.upgradePerks', undefined, locale),
      )
      .setStyle(state.mode === 'perk_upgrade' ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled || !hasUpgradeablePerks),
    new ButtonBuilder()
      .setCustomId(`${p}_perks`)
      .setLabel(
        PERKS_MODIFY_ENABLED && state.mode === 'perks'
          ? await translateForUser(userId, 'schematics.view.buttons.hidePerks', undefined, locale)
          : await translateForUser(userId, 'schematics.view.buttons.modifyPerks', undefined, locale),
      )
      .setStyle(
        PERKS_MODIFY_ENABLED && state.mode === 'perks' ? ButtonStyle.Secondary : ButtonStyle.Primary,
      )
      .setDisabled(disabled || !PERKS_MODIFY_ENABLED),
  );

  rows.push(mainRow);

  if (state.mode === 'perk_upgrade') {
    const upgradeable = perks.filter((pk) => pk.canUpgrade);

    if (upgradeable.length > 0) {
      const perkButtons: ButtonBuilder[] = [];
      for (const perk of upgradeable) {
        perkButtons.push(
          new ButtonBuilder()
            .setCustomId(`${p}_perkup_${perk.slot}`)
            .setLabel(
              await translateForUser(userId, 'schematics.view.buttons.upgradePerk', {
                slot: String(perk.slot + 1),
              }, locale),
            )
            .setEmoji(
              perkTierEmoji(perk.tierKey).match(/:(\d+)>$/)?.[1]
                ?? (perk.tierKey === 'legendary' ? '1542942568130674708' : '1542942458030203000'),
            )
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        );
      }
      for (let i = 0; i < perkButtons.length; i += 5) {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(perkButtons.slice(i, i + 5)),
        );
      }
    }
  }

  if (PERKS_MODIFY_ENABLED && state.mode === 'perks') {
    const slotSelect = new StringSelectMenuBuilder()
      .setCustomId(`${p}_respec_slot`)
      .setPlaceholder(await translateForUser(userId, 'schematics.view.respecSlotPlaceholder', undefined, locale))
      .setDisabled(disabled)
      .addOptions(
        { label: await translateForUser(userId, 'schematics.view.buttons.cancel', undefined, locale), value: 'cancel' },
        ...perks
          .filter((pk) => pk.alterationId)
          .map((pk) => ({
            label: pk.displayName.slice(0, 100),
            value: String(pk.slot),
            emoji: perkTierEmoji(pk.tierKey).match(/:(\d+)>$/)?.[1]
              ? { id: perkTierEmoji(pk.tierKey).match(/:(\d+)>$/)![1] }
              : undefined,
          })),
      );

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(slotSelect));

    if (state.respecSlot != null) {
      const options = listRespecPerkOptions(
        schematic.templateId,
        schematic.category,
        state.respecSlot,
      );
      const replaceSelect = new StringSelectMenuBuilder()
        .setCustomId(`${p}_respec_pick`)
        .setPlaceholder(
          await translateForUser(userId, 'schematics.view.respecPickPlaceholder', undefined, locale),
        )
        .setDisabled(disabled)
        .addOptions(
          { label: await translateForUser(userId, 'schematics.view.buttons.cancel', undefined, locale), value: 'cancel' },
          ...options.map((opt) => ({ label: opt.label, value: opt.value })),
        );
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(replaceSelect));
    }
  }

  return rows;
}

async function buildPanelPayload(
  interaction: ChatInputCommandInteraction,
  schematic: CampaignSchematicItem,
  state: PanelState,
  disabled = false,
): Promise<InteractionEditReplyOptions> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const lang = (await getUserLanguage(userId, locale)) as SupportedLanguage;
  const name = translateItemName(schematic.templateId, lang);
  const typeEm = schematicRarityEmoji(interaction.client, schematic);
  const power = getStwPowerLevel(schematic.rarity, schematic.level);
  const pwrEm = powerEmoji(interaction.client);
  const title = `${typeEm} ${name} · ${pwrEm} **${power}**`.trim();
  const description = await buildDescription(
    schematic,
    userId,
    locale,
    interaction.client,
    state.mode === 'evolution' ? 'evolution' : state.mode,
  );
  const components = await buildComponents(
    interaction.id,
    schematic,
    state,
    userId,
    locale,
    lang,
    disabled,
  );
  const author = await getEpicAuthor(userId);
  const { thumbnail, files } = resolveSchematicThumbnail(schematic);

  const payload = await buildEpicReplyPayload(userId, {
    style: 'info',
    title,
    description,
    thumbnail,
    author,
    footerKey: 'brand',
  }, interaction, locale, files);

  return { ...payload, components };
}

export async function runSchematicViewPanel(
  interaction: ChatInputCommandInteraction,
  schematic: CampaignSchematicItem,
  ctx: SchematicAccountContext,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;

  let current = schematic;
  let state: PanelState = { mode: 'main', respecSlot: null };

  const p = prefix(interaction.id);
  await interaction.editReply(await buildPanelPayload(interaction, current, state));

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    idle: EPIC_PANEL_IDLE_MS,
    filter: (i) => i.user.id === userId && i.customId.startsWith(p),
  });

  if (!collector) return;

  const refresh = async () => {
    await interaction.editReply(await buildPanelPayload(interaction, current, state));
  };

  const onlyUser = async () => {
    return translateForUser(userId, 'schematics.view.onlyUser', undefined, locale);
  };

  collector.on('collect', async (componentInteraction) => {
    if (componentInteraction.user.id !== userId) {
      await componentInteraction.reply({ content: await onlyUser(), ephemeral: true });
      return;
    }

    if (componentInteraction.isButton()) {
      await handleButton(componentInteraction, componentInteraction.customId);
    } else if (componentInteraction.isStringSelectMenu()) {
      await handleSelect(componentInteraction, componentInteraction.customId);
    }
  });

  collector.on('end', async (_, reason) => {
    if (!isCollectorIdle(reason)) return;
    try {
      const inactive = await translateForUser(userId, 'epic.inactivePanel', undefined, locale);
      await editReplyInactive(interaction, inactive);
    } catch { /* expired */ }
  });

  async function handleButton(btn: ButtonInteraction, customId: string): Promise<void> {
    await btn.deferUpdate();

    if (customId === `${p}_perk_upgrade`) {
      state.mode = state.mode === 'perk_upgrade' ? 'main' : 'perk_upgrade';
      if (state.mode === 'perk_upgrade') state.respecSlot = null;
      await refresh();
      return;
    }

    if (customId === `${p}_perks`) {
      if (!PERKS_MODIFY_ENABLED) return;
      state.mode = state.mode === 'perks' ? 'main' : 'perks';
      if (state.mode === 'perks') state.respecSlot = null;
      await refresh();
      return;
    }

    if (customId === `${p}_cancel_evo`) {
      state.mode = 'main';
      await refresh();
      return;
    }

    if (customId === `${p}_rarity`) {
      const result = await upgradeSchematicRarity(ctx, current);
      if (!result.success) {
        await interaction.followUp({
          content: await translateForUser(userId, 'schematics.view.errors.generic', {
            error: result.error ?? 'unknown',
          }, locale),
          ephemeral: true,
        });
        return;
      }
      if (result.schematic) current = result.schematic;
      await refresh();
      return;
    }

    if (customId === `${p}_max`) {
      if (schematicNeedsEvolutionChoice(current)) {
        state.mode = 'evolution';
        await refresh();
        return;
      }
      const result = await upgradeSchematicToMax(ctx, current, 0);
      if (!result.success) {
        await interaction.followUp({
          content: await translateForUser(userId, 'schematics.view.errors.generic', {
            error: result.error ?? 'unknown',
          }, locale),
          ephemeral: true,
        });
        return;
      }
      const updated = await reloadSchematic(ctx, result.finalItemId);
      if (updated) current = updated;
      state.mode = 'main';
      await refresh();
      return;
    }

    if (customId.startsWith(`${p}_evo_`)) {
      const choice = customId.endsWith('_0') ? 0 : 1;
      const result = await upgradeSchematicToMax(ctx, current, choice);
      if (!result.success) {
        await interaction.followUp({
          content: await translateForUser(userId, 'schematics.view.errors.generic', {
            error: result.error ?? 'unknown',
          }, locale),
          ephemeral: true,
        });
        return;
      }
      const updated = await reloadSchematic(ctx, result.finalItemId);
      if (updated) current = updated;
      state.mode = 'main';
      await refresh();
      return;
    }

    if (customId.startsWith(`${p}_perkup_`)) {
      const slot = parseInt(customId.split('_').pop() ?? '-1', 10);
      if (slot < 0 || slot > 5) return;
      const result = await upgradeSchematicPerk(ctx, current, slot);
      if (!result.success) {
        await interaction.followUp({
          content: await translateForUser(userId, 'schematics.view.errors.generic', {
            error: result.error ?? 'unknown',
          }, locale),
          ephemeral: true,
        });
        return;
      }
      if (result.schematic) current = result.schematic;
      state.mode = 'perk_upgrade';
      await refresh();
    }
  }

  async function handleSelect(sel: StringSelectMenuInteraction, customId: string): Promise<void> {
    await sel.deferUpdate();
    const value = sel.values[0];

    if (customId === `${p}_respec_slot`) {
      if (!PERKS_MODIFY_ENABLED) return;
      if (value === 'cancel') {
        state.respecSlot = null;
      } else {
        state.respecSlot = parseInt(value, 10);
        state.mode = 'perks';
      }
      await refresh();
      return;
    }

    if (customId === `${p}_respec_pick`) {
      if (!PERKS_MODIFY_ENABLED) return;
      if (value === 'cancel' || state.respecSlot == null) {
        state.respecSlot = null;
        await refresh();
        return;
      }
      const result = await respecSchematicPerk(ctx, current, state.respecSlot, value);
      state.respecSlot = null;
      if (!result.success) {
        await interaction.followUp({
          content: await translateForUser(userId, 'schematics.view.errors.generic', {
            error: result.error ?? 'unknown',
          }, locale),
          ephemeral: true,
        });
        return;
      }
      if (result.schematic) current = result.schematic;
      state.mode = 'perks';
      await refresh();
    }
  }
}
