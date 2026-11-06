import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicEmbed,
  getEpicAuthor,
  replyEpicApiError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { editFakeReply } from './fakeReply.ts';
import type { GhostequipPartySummary, LeaderCheckResult } from './types.ts';

const META_SELECT_PREFIX = 'ghostequip_meta_';
const MODE_SELECT_PREFIX = 'ghostequip_mode_';

export const LOBBY_MODE_PRESETS: Record<string, { mnemonic: string; teamSize: string; labelKey: string }> = {
  squad: { mnemonic: 'playlist_defaultsquad', teamSize: 'Squad', labelKey: 'ghostequip.meta.mode.presets.squad' },
  duo: { mnemonic: 'playlist_defaultduo', teamSize: 'Duo', labelKey: 'ghostequip.meta.mode.presets.duo' },
  solo: { mnemonic: 'playlist_defaultsolo', teamSize: 'Solo', labelKey: 'ghostequip.meta.mode.presets.solo' },
  trio: { mnemonic: 'playlist_defaulttrio', teamSize: 'Trio', labelKey: 'ghostequip.meta.mode.presets.trio' },
  reload: { mnemonic: 'playlist_showdownalt_solo', teamSize: 'Solo', labelKey: 'ghostequip.meta.mode.presets.reload' },
  blitz: { mnemonic: 'playlist_blitz_squad', teamSize: 'Squad', labelKey: 'ghostequip.meta.mode.presets.blitz' },
  zero: { mnemonic: 'playlist_nobuildbr_squad', teamSize: 'Squad', labelKey: 'ghostequip.meta.mode.presets.zero' },
};

const ISLAND_CODE_RE = /^\d{4}-\d{4}-\d{4}$/i;

async function replyLeaderOnly(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  await replyWithEpicEmbed(interaction, userId, {
    style: 'warning',
    title: await translateEpic(interaction.client, userId, 'ghostequip.common.errors.noPermissions.title', 'warning'),
    description: await translateForUser(
      userId,
      'ghostequip.meta.errors.leaderOnly',
      undefined,
      interaction.locale,
    ),
  });
}

async function memberLabelWithStatus(
  userId: string,
  member: { id: string; displayName: string },
  hidden: boolean,
  locale?: string,
): Promise<string> {
  const name = member.displayName || member.id;
  const statusKey = hidden ? 'ghostequip.meta.visibility.hidden' : 'ghostequip.meta.visibility.visible';
  const status = await translateForUser(userId, statusKey, undefined, locale);
  return `${name} — ${status}`.slice(0, 100);
}

async function promptHideSelection(
  interaction: ChatInputCommandInteraction,
  userId: string,
  options: StringSelectMenuOptionBuilder[],
  maxSelectable: number,
): Promise<string[] | null> {
  const customId = `${META_SELECT_PREFIX}hide_${userId}`;
  const placeholder = await translateForUser(userId, 'ghostequip.meta.hide.selectPlaceholder', undefined, interaction.locale);
  const prompt = await translateForUser(userId, 'ghostequip.meta.hide.selectPrompt', undefined, interaction.locale);
  const author = await getEpicAuthor(userId);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder.slice(0, 100))
    .setMinValues(0)
    .setMaxValues(maxSelectable)
    .addOptions(options);

  const embed = await buildEpicEmbed(userId, {
    style: 'info',
    description: prompt,
    author,
  }, interaction);

  await interaction.editReply({
    content: null,
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });

  try {
    const selectInteraction = (await interaction.fetchReply().then((msg) =>
      msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: (i) => i.user.id === userId && i.customId === customId,
      }),
    )) as StringSelectMenuInteraction;

    await selectInteraction.deferUpdate();
    return selectInteraction.values;
  } catch {
    return null;
  }
}

async function replyMetaSuccess(
  interaction: ChatInputCommandInteraction,
  userId: string,
  titleKey: string,
  descriptionKey: string,
  vars?: Record<string, string>,
  fields?: Array<{ name: string; value: string; inline?: boolean }>,
): Promise<void> {
  const author = await getEpicAuthor(userId);
  await editFakeReply(interaction, userId, {
    style: 'success',
    title: await translateForUser(userId, titleKey, undefined, interaction.locale),
    description: await translateForUser(userId, descriptionKey, vars, interaction.locale),
    fields,
    author,
  });
}

export async function handleMetaHide(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const party = await callCore<GhostequipPartySummary>('fake.party', { userId });
    if (!party) return;
    if (!party.isLeader) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    const hidden = new Set(party.hiddenMemberIds);
    const others = party.members.filter((member) => member.id !== party.accountId);

    if (others.length === 0) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        description: await translateForUser(userId, 'ghostequip.meta.errors.noOtherMembers', undefined, interaction.locale),
      });
      return;
    }

    const options = await Promise.all(
      others.map(async (member) => {
        const isHidden = hidden.has(member.id);
        return new StringSelectMenuOptionBuilder()
          .setLabel(await memberLabelWithStatus(userId, member, isHidden, interaction.locale))
          .setValue(member.id)
          .setDefault(isHidden);
      }),
    );

    const selected = await promptHideSelection(interaction, userId, options, others.length);
    if (selected === null) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(interaction.client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.variants.errors.timeout', undefined, interaction.locale),
      });
      return;
    }

    await callCore('fake.hide', {
      userId,
      accountId: party.accountId,
      memberIds: selected,
    });

    const nameOf = (id: string) => party.members.find((member) => member.id === id)?.displayName ?? id;
    const hiddenNames = selected.length > 0
      ? selected.map(nameOf).join(', ')
      : '—';
    const visibleIds = others.map((member) => member.id).filter((id) => !selected.includes(id));
    const visibleNames = visibleIds.length > 0
      ? visibleIds.map(nameOf).join(', ')
      : '—';

    const hiddenLabel = await translateForUser(userId, 'ghostequip.meta.hide.result.hidden', undefined, interaction.locale);
    const visibleLabel = await translateForUser(userId, 'ghostequip.meta.hide.result.visible', undefined, interaction.locale);

    await replyMetaSuccess(
      interaction,
      userId,
      'ghostequip.meta.hide.success.title',
      'ghostequip.meta.hide.success.description',
      undefined,
      [
        { name: hiddenLabel, value: hiddenNames.slice(0, 1024), inline: false },
        { name: visibleLabel, value: visibleNames.slice(0, 1024), inline: false },
      ],
    );
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META HIDE]');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleMetaSolo(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const result = await callCore<LeaderCheckResult>('fake.solo', { userId });
    if (result?.leaderOnly) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    await replyMetaSuccess(
      interaction,
      userId,
      'ghostequip.meta.solo.success.title',
      'ghostequip.meta.solo.success.description',
    );
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META SOLO]');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleMetaTempo(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const tempo = interaction.options.getInteger('bpm', true);

  try {
    const result = await callCore<LeaderCheckResult>('fake.tempo', { userId, tempo });
    if (result?.leaderOnly) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    await replyMetaSuccess(
      interaction,
      userId,
      'ghostequip.meta.tempo.success.title',
      'ghostequip.meta.tempo.success.description',
      { tempo: String(tempo) },
    );
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META TEMPO]');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleMetaMode(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const islandCode = interaction.options.getString('isla')?.trim();

  try {
    const party = await callCore<GhostequipPartySummary>('fake.party', { userId });
    if (!party) return;
    if (!party.isLeader) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    if (islandCode) {
      if (!ISLAND_CODE_RE.test(islandCode)) {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          description: await translateForUser(userId, 'ghostequip.meta.mode.errors.invalidIsland', undefined, interaction.locale),
        });
        return;
      }
      const mnemonic = islandCode.toLowerCase();
      await callCore('fake.mode', {
        userId,
        accountId: party.accountId,
        mnemonic,
        teamSize: LOBBY_MODE_PRESETS.squad.teamSize,
      });
      await replyMetaSuccess(
        interaction,
        userId,
        'ghostequip.meta.mode.success.title',
        'ghostequip.meta.mode.success.description',
        { mode: islandCode },
      );
      return;
    }

    const customId = `${MODE_SELECT_PREFIX}${userId}`;
    const prompt = await translateForUser(userId, 'ghostequip.meta.mode.selectPrompt', undefined, interaction.locale);
    const placeholder = await translateForUser(userId, 'ghostequip.meta.mode.selectPlaceholder', undefined, interaction.locale);
    const author = await getEpicAuthor(userId);

    const options = await Promise.all(
      Object.entries(LOBBY_MODE_PRESETS).map(async ([value, cfg]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel((await translateForUser(userId, cfg.labelKey, undefined, interaction.locale)).slice(0, 100))
          .setValue(value),
      ),
    );

    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder.slice(0, 100))
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const embed = await buildEpicEmbed(userId, {
      style: 'info',
      description: prompt,
      author,
    }, interaction);

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });

    try {
      const selectInteraction = (await interaction.fetchReply().then((msg) =>
        msg.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: 60_000,
          filter: (i) => i.user.id === userId && i.customId === customId,
        }),
      )) as StringSelectMenuInteraction;

      await selectInteraction.deferUpdate();
      const preset = selectInteraction.values[0];
      const mode = LOBBY_MODE_PRESETS[preset];
      if (!mode) {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          description: await translateForUser(userId, 'ghostequip.meta.mode.errors.invalidMode', undefined, interaction.locale),
        });
        return;
      }

      const result = await callCore<LeaderCheckResult>('fake.mode', {
        userId,
        accountId: party.accountId,
        mnemonic: mode.mnemonic,
        teamSize: mode.teamSize,
      });
      if (result?.leaderOnly) {
        await replyLeaderOnly(interaction, userId);
        return;
      }

      const label = await translateForUser(userId, mode.labelKey, undefined, interaction.locale);
      await replyMetaSuccess(
        interaction,
        userId,
        'ghostequip.meta.mode.success.title',
        'ghostequip.meta.mode.success.description',
        { mode: label },
      );
    } catch {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(interaction.client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.variants.errors.timeout', undefined, interaction.locale),
      });
    }
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META MODE]');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleMetaReset(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const result = await callCore<LeaderCheckResult>('fake.reset', { userId });
    if (result?.leaderOnly) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    await replyMetaSuccess(
      interaction,
      userId,
      'ghostequip.meta.reset.success.title',
      'ghostequip.meta.reset.success.description',
    );
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META RESET]');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleMetaChaos(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const result = await callCoreWithTimeout<LeaderCheckResult>(
      'fake.chaos',
      10 * 60_000,
      { userId, kind: 'mode' },
    );
    if (result?.leaderOnly) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    await replyMetaSuccess(
      interaction,
      userId,
      'ghostequip.meta.chaos.success.title',
      'ghostequip.meta.chaos.success.description',
    );
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META CHAOS]');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleMetaBugButtons(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const result = await callCoreWithTimeout<LeaderCheckResult>(
      'fake.chaos',
      10 * 60_000,
      { userId, kind: 'bugButtons' },
    );
    if (result?.leaderOnly) {
      await replyLeaderOnly(interaction, userId);
      return;
    }

    await replyMetaSuccess(
      interaction,
      userId,
      'ghostequip.meta.bugbuttons.success.title',
      'ghostequip.meta.bugbuttons.success.description',
    );
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP META BUG-BUTTONS]');
    await replyEpicApiError(interaction, userId, error);
  }
}
