/**
 * /loadouts — Browse your STW loadouts, preview image, upload to community channel.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type EmbedBuilder,
  type MessageEditOptions,
} from 'discord.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Command } from '#structures/types.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { buildDiscordLocalizations, getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { parseLoadoutFromItems } from '#helpers/epic/stw/loadouts/parseLoadoutData.ts';
import { catalogHeroPortraitPath } from '#helpers/epic/stw/loadouts/stwCatalogLoadout.ts';
import { generateStwLoadoutImage } from '#managers/epic/stw/generators/stwLoadoutImageGenerator.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import {
  extractLoadoutSnapshot,
  newCommunityPublicId,
  STW_COMMUNITY_GUILD_ID,
  STW_COMMUNITY_LOADOUTS_CHANNEL_ID,
  type StwLoadoutSlot,
} from '#managers/epic/stw/stwLoadoutShared.ts';
import { buildCommunityMessagePayload, COMMUNITY_CHANNEL_LANG } from '#helpers/epic/stw/loadouts/loadoutsCommunityEmbed.ts';
import CommunityLoadout from '#models/CommunityLoadout.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicQuote,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
  editMessageInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';

export const LOADOUTS_HUB_PREFIX = 'lo_hub';
export const LOADOUTS_MODAL_PREFIX = 'lo_hub_modal';
/** STW accounts can have 1–20 hero loadout slots; Discord allows 5 rows × 5 buttons (4 picker + 1 actions). */
const MAX_LOADOUT_BUTTONS = 20;

async function fetchLoadoutSlots(
  accountId: string,
  accessToken: string,
  lang: SupportedLanguage,
): Promise<StwLoadoutSlot[]> {
  return callCoreWithTimeout<StwLoadoutSlot[]>('loadouts.fetchSlots', 60_000, { accountId, accessToken, lang });
}

async function queryCampaignItems(
  accountId: string,
  accessToken: string,
): Promise<Record<string, any>> {
  return callCoreWithTimeout<Record<string, any>>('loadouts.queryItems', 60_000, { accountId, accessToken });
}

export function loHubCustomId(sessionId: string, action: string, loadoutGuid?: string): string {
  if (loadoutGuid) return `${LOADOUTS_HUB_PREFIX}|${sessionId}|${action}|${loadoutGuid}`;
  return `${LOADOUTS_HUB_PREFIX}|${sessionId}|${action}`;
}

export function parseLoHubCustomId(customId: string): {
  sessionId: string;
  action: string;
  loadoutGuid?: string;
} | null {
  if (!customId.startsWith(`${LOADOUTS_HUB_PREFIX}|`)) return null;
  const parts = customId.split('|');
  if (parts.length < 3) return null;
  return {
    sessionId: parts[1]!,
    action: parts[2]!,
    loadoutGuid: parts.length > 3 ? parts.slice(3).join('|') : undefined,
  };
}

function trimPickerLabel(slot: StwLoadoutSlot, totalSlots: number): string {
  const base = `#${slot.index} ${slot.commanderDisplayName}`;
  const maxLen = totalSlots > 15 ? 45 : totalSlots > 10 ? 60 : 80;
  return base.length <= maxLen ? base : `${base.slice(0, maxLen - 3)}...`;
}

function buildLoadoutPickerRows(
  sessionId: string,
  slots: StwLoadoutSlot[],
  selectedGuid: string | null,
  lockSelectedSlot: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const visible = slots.slice(0, MAX_LOADOUT_BUTTONS);
  for (let i = 0; i < visible.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const slot of visible.slice(i, i + 5)) {
      const isSelected = slot.guid === selectedGuid;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(loHubCustomId(sessionId, 'pick', slot.guid))
          .setLabel(trimPickerLabel(slot, visible.length))
          .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(lockSelectedSlot && isSelected),
      );
    }
    rows.push(row);
  }
  return rows;
}

async function buildSelectedActionRow(
  sessionId: string,
  selectedGuid: string,
  userId: string,
  locale: string | null | undefined,
  uploaded: boolean,
  opts?: { uploadDisabled?: boolean },
): Promise<ActionRowBuilder<ButtonBuilder>> {
  const actionRow = new ActionRowBuilder<ButtonBuilder>();

  if (uploaded) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(loHubCustomId(sessionId, 'uploaded'))
        .setLabel(await translateForUser(userId, 'loadouts.hub.alreadyUploaded', undefined, locale))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
    return actionRow;
  }

  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(loHubCustomId(sessionId, 'back'))
      .setLabel(await translateForUser(userId, 'loadouts.hub.back', undefined, locale))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(loHubCustomId(sessionId, 'upload', selectedGuid))
      .setLabel(await translateForUser(userId, 'loadouts.hub.upload', undefined, locale))
      .setStyle(ButtonStyle.Success)
      .setDisabled(opts?.uploadDisabled ?? false),
  );

  return actionRow;
}

async function findUploadedForSlot(
  discordId: string,
  accountId: string,
  loadoutIndex: number,
) {
  return CommunityLoadout.findOne({
    authorDiscordId: discordId,
    authorAccountId: accountId,
    loadoutIndex,
    messageId: { $exists: true, $ne: null },
  }).lean();
}

export type LoadoutsHubPreviewPhase = 'list' | 'loading' | 'ready';

type LoadoutsHubRender = {
  embed: EmbedBuilder;
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

function buildHubEditPayload(hub: LoadoutsHubRender): MessageEditOptions {
  return {
    embeds: [hub.embed],
    components: hub.components,
    files: hub.files,
  };
}

async function applyHubToMessage(
  message: Message,
  hub: LoadoutsHubRender,
): Promise<void> {
  await message.edit(buildHubEditPayload(hub));
}

export async function refreshLoadoutsHubPanel(params: {
  message: Message;
  sessionId: string;
  loadoutGUID: string;
  lang: SupportedLanguage;
  discordId: string;
  accountId: string;
  accessToken: string;
  authorData: { name: string; iconURL: string } | null;
  interaction?: ChatInputCommandInteraction;
  locale?: string | null;
}): Promise<void> {
  const slots = await fetchLoadoutSlots(params.accountId, params.accessToken, params.lang);
  const hub = await renderLoadoutsHub(
    params.interaction,
    params.sessionId,
    slots,
    params.loadoutGUID,
    {
      lang: params.lang,
      locale: params.locale,
      authorData: params.authorData,
      accountId: params.accountId,
      accessToken: params.accessToken,
      discordId: params.discordId,
      previewPhase: 'ready',
    },
  );
  await applyHubToMessage(params.message, hub);
}

export async function renderLoadoutsHub(
  interaction: ChatInputCommandInteraction | undefined,
  sessionId: string,
  slots: StwLoadoutSlot[],
  selectedGuid: string | null,
  opts: {
    lang: SupportedLanguage;
    locale?: string | null;
    authorData: { name: string; iconURL: string } | null;
    accountId: string;
    accessToken: string;
    discordId: string;
    statusMessage?: string;
    previewPhase?: LoadoutsHubPreviewPhase;
  },
): Promise<LoadoutsHubRender> {
  const files: AttachmentBuilder[] = [];
  const previewPhase = opts.previewPhase ?? (selectedGuid ? 'ready' : 'list');
  const selectedSlot = selectedGuid ? slots.find((s) => s.guid === selectedGuid) : null;
  const visibleCount = Math.min(slots.length, MAX_LOADOUT_BUTTONS);
  const locale = opts.locale;

  const title = await translateForUser(opts.discordId, 'loadouts.hub.title', undefined, locale);

  let description =
    opts.statusMessage ??
    (visibleCount < slots.length
      ? await translateForUser(opts.discordId, 'loadouts.hub.pickLoadoutTruncated', {
        shown: String(visibleCount),
        total: String(slots.length),
      }, locale)
      : await translateForUser(opts.discordId, 'loadouts.hub.pickLoadout', undefined, locale));

  const lockSelectedSlot = Boolean(selectedGuid);
  const components: ActionRowBuilder<ButtonBuilder>[] = [
    ...buildLoadoutPickerRows(sessionId, slots, selectedGuid, lockSelectedSlot),
  ];

  if (selectedGuid && previewPhase === 'loading') {
    const previewLine = selectedSlot
      ? await translateForUser(opts.discordId, 'loadouts.hub.loadingPreview', {
        n: String(selectedSlot.index),
        name: selectedSlot.commanderDisplayName,
      }, locale)
      : description;

    const payload = await buildEpicReplyPayload(
      opts.discordId,
      {
        loading: true,
        title,
        description: opts.statusMessage ? `${opts.statusMessage}\n\n${previewLine}` : previewLine,
        author: opts.authorData,
        footerKey: 'brand',
      },
      interaction,
      locale,
    );

    components.push(
      await buildSelectedActionRow(sessionId, selectedGuid, opts.discordId, locale, false, { uploadDisabled: true }),
    );

    return { embed: payload.embeds[0]!, files: payload.files ?? [], components };
  }

  if (selectedGuid && previewPhase === 'ready') {
    const items = await queryCampaignItems(opts.accountId, opts.accessToken);
    const renderData = parseLoadoutFromItems(items, selectedGuid, opts.lang);
    const uploadedDoc = renderData
      ? await findUploadedForSlot(opts.discordId, opts.accountId, renderData.loadoutIndex)
      : null;
    const isUploaded = Boolean(uploadedDoc?.publicId);

    let embed: EmbedBuilder;
    if (renderData) {
      const tmpDir = path.join(os.tmpdir(), 'glow-loadout-images', opts.discordId);
      const gen = await generateStwLoadoutImage({
        data: renderData,
        savePath: tmpDir,
        fileName: `hub_${sessionId}.png`,
      });
      if (gen.success && gen.path) {
        const att = new AttachmentBuilder(gen.path, { name: 'loadout_preview.png' });
        files.push(att);

        let thumbnail: string | undefined;
        const commanderPortrait =
          renderData.commander?.portraitPath ??
          (renderData.commander
            ? catalogHeroPortraitPath(renderData.commander.templateId)
            : null);
        if (commanderPortrait && fs.existsSync(commanderPortrait)) {
          const thumbExt = path.extname(commanderPortrait) || '.png';
          const thumbName = `commander_thumb${thumbExt}`;
          files.push(new AttachmentBuilder(commanderPortrait, { name: thumbName }));
          thumbnail = `attachment://${thumbName}`;
        }

        const footerText =
          isUploaded && uploadedDoc
            ? `${(uploadedDoc.likes ?? []).length} 👍  ${(uploadedDoc.dislikes ?? []).length} 👎`
            : undefined;

        const partialNotice =
          opts.lang !== 'en'
            ? epicQuote(
                await translateForUser(
                  opts.discordId,
                  'loadouts.hub.partialTranslationNotice',
                  undefined,
                  locale,
                ),
              )
            : undefined;

        const payload = await buildEpicReplyPayload(
          opts.discordId,
          {
            style: 'info',
            description: partialNotice,
            image: 'attachment://loadout_preview.png',
            thumbnail,
            author: opts.authorData,
            footerText,
            footerKey: footerText ? 'none' : 'brand',
          },
          interaction,
          locale,
          files,
        );
        embed = payload.embeds[0]!;
      } else {
        embed = await buildEpicEmbed(
          opts.discordId,
          {
            style: 'error',
            title,
            description: epicQuote(
              (opts.statusMessage ? `${opts.statusMessage}\n\n` : '') +
              await translateForUser(opts.discordId, 'loadout.image.error', undefined, locale),
            ),
            author: opts.authorData,
            footerKey: 'brand',
          },
          interaction,
          locale,
        );
      }
    } else {
      embed = await buildEpicEmbed(
        opts.discordId,
        {
          style: 'error',
          title,
          description: epicQuote(await translateForUser(opts.discordId, 'hero.errors.notFound', undefined, locale)),
          author: opts.authorData,
          footerKey: 'brand',
        },
        interaction,
        locale,
      );
    }

    components.push(
      await buildSelectedActionRow(sessionId, selectedGuid, opts.discordId, locale, isUploaded),
    );
    return { embed, files, components };
  }

  const embed = await buildEpicEmbed(
    opts.discordId,
    {
      style: 'info',
      title,
      description: epicQuote(description),
      author: opts.authorData,
      footerKey: 'brand',
    },
    interaction,
    locale,
  );

  return { embed, files, components };
}

export async function publishLoadoutToCommunity(opts: {
  discordId: string;
  accountId: string;
  accessToken: string;
  displayName: string;
  loadoutGUID: string;
  presetName: string;
  lang: SupportedLanguage;
  client: ChatInputCommandInteraction['client'];
}): Promise<{ ok: boolean; error?: string; publicId?: string }> {
  const items = await queryCampaignItems(opts.accountId, opts.accessToken);
  const snapshot = extractLoadoutSnapshot(items, opts.loadoutGUID, COMMUNITY_CHANNEL_LANG);
  if (!snapshot) {
    return { ok: false, error: await translateForUser(opts.discordId, 'hero.errors.notFound') };
  }

  const existing = await findUploadedForSlot(opts.discordId, opts.accountId, snapshot.loadoutIndex);
  if (existing) {
    return { ok: false, error: await translateForUser(opts.discordId, 'loadouts.hub.alreadyUploadedError') };
  }

  const renderData = parseLoadoutFromItems(items, opts.loadoutGUID, COMMUNITY_CHANNEL_LANG);
  if (!renderData) {
    return { ok: false, error: await translateForUser(opts.discordId, 'loadout.image.error') };
  }

  const tmpDir = path.join(os.tmpdir(), 'glow-loadout-images', opts.discordId);
  const gen = await generateStwLoadoutImage({
    data: renderData,
    savePath: tmpDir,
    fileName: `community_${Date.now()}.png`,
  });
  if (!gen.success || !gen.path) {
    return { ok: false, error: await translateForUser(opts.discordId, 'loadout.image.error') };
  }

  const publicId = newCommunityPublicId();
  const finalName = `${opts.presetName.trim()} (${snapshot.commanderDisplayName})`;

  const doc = await CommunityLoadout.create({
    publicId,
    name: finalName,
    commanderEnName: snapshot.commanderDisplayName,
    authorDiscordId: opts.discordId,
    authorAccountId: opts.accountId,
    authorDisplayName: opts.displayName,
    sourceLoadoutGuid: snapshot.sourceLoadoutGuid,
    commanderTemplateId: snapshot.commanderTemplateId,
    commanderLevel: snapshot.commanderLevel,
    teamHeroTemplateIds: snapshot.teamHeroTemplateIds,
    teamHeroLevels: snapshot.teamHeroLevels,
    teamHeroDisplayNames: snapshot.teamHeroDisplayNames,
    teamPerkTemplateId: snapshot.teamPerkTemplateId,
    teamPerkDisplayName: snapshot.teamPerkDisplayName,
    gadgets: snapshot.gadgets,
    gadgetDisplayNames: snapshot.gadgetDisplayNames,
    loadoutIndex: snapshot.loadoutIndex,
    saves: 0,
    likes: [],
    dislikes: [],
  });

  const payload = await buildCommunityMessagePayload(
    doc,
    publicId,
    gen.path,
    COMMUNITY_CHANNEL_LANG,
    opts.client,
  );

  const guild = await opts.client.guilds.fetch(STW_COMMUNITY_GUILD_ID).catch(() => null);
  if (!guild) {
    await CommunityLoadout.deleteOne({ _id: doc._id });
    return { ok: false, error: await translateForUser(opts.discordId, 'loadouts.community.channelUnavailable') };
  }

  const channel = await guild.channels.fetch(STW_COMMUNITY_LOADOUTS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await CommunityLoadout.deleteOne({ _id: doc._id });
    return { ok: false, error: await translateForUser(opts.discordId, 'loadouts.community.channelUnavailable') };
  }

  const msg = await channel.send(payload as Parameters<typeof channel.send>[0]);
  await CommunityLoadout.updateOne(
    { _id: doc._id },
    {
      messageId: msg.id,
      channelId: channel.id,
      guildId: guild.id,
    },
  );

  try {
    if (gen.path && fs.existsSync(gen.path)) fs.unlinkSync(gen.path);
  } catch {
    // ignore cleanup
  }

  log.commands.info(
    { discordId: opts.discordId, publicId, messageId: msg.id },
    '[LOADOUTS] Published to community',
  );

  return { ok: true, publicId };
}

async function handleLoadouts(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const locale = interaction.locale;
  const lang = (await getUserLanguage(discordId, locale)) as SupportedLanguage;

  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
  if (!userInfo || !mainAccount) {
    await replyEpicCredentialError(interaction, discordId, 'noMain');
    return;
  }

  const account = mainAccount;

  const authorData = await getEpicAuthor(discordId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: account.displayName || mainAccount.displayName || 'Unknown',
  });

  const slots = await fetchLoadoutSlots(account.accountId, account.accessToken, lang);
  if (slots.length === 0) {
    await replyEpicCustomError(interaction, discordId, 'hero.autocomplete.noLoadouts');
    return;
  }

  const sessionId = interaction.id;

  let hub: LoadoutsHubRender;
  try {
    hub = await renderLoadoutsHub(interaction, sessionId, slots, null, {
      lang,
      locale,
      authorData,
      accountId: account.accountId,
      accessToken: account.accessToken,
      discordId,
    });
  } catch (err) {
    log.commands.warn({ err, discordId }, '[LOADOUTS] Hub render failed');
    await replyEpicCustomError(interaction, discordId, 'loadout.image.error');
    return;
  }

  await interaction.editReply(buildHubEditPayload(hub));
  const message = (await interaction.fetchReply()) as Message;

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === discordId,
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (componentInteraction) => {
    const parsed = parseLoHubCustomId(componentInteraction.customId);
    if (!parsed || parsed.sessionId !== sessionId) return;

    if (componentInteraction.user.id !== discordId) {
      await componentInteraction.reply({
        content: await translateForUser(discordId, 'gamepanel.errors.notYourPanel', undefined, locale),
        ephemeral: true,
      }).catch(() => null);
      return;
    }

    if (parsed.action === 'upload' && parsed.loadoutGuid) {
      const modal = new ModalBuilder()
        .setCustomId(`${LOADOUTS_MODAL_PREFIX}|${sessionId}|${parsed.loadoutGuid}`)
        .setTitle(await translateForUser(discordId, 'loadouts.hub.uploadModalTitle', undefined, locale));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('preset_name')
            .setLabel(await translateForUser(discordId, 'loadouts.hub.uploadNameLabel', undefined, locale))
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(50)
            .setRequired(true)
            .setPlaceholder(await translateForUser(discordId, 'hero.community.namePlaceholder', undefined, locale)),
        ),
      );
      await componentInteraction.showModal(modal);
      return;
    }

    if (parsed.action === 'uploaded') return;

    await componentInteraction.deferUpdate().catch(() => null);

    const freshUser = await UsuarioInfo.findOne({ id: discordId });
    const freshMain = freshUser?.deviceAuths?.find((a: any) => a.cuentaMain);
    if (!freshUser || !freshMain) return;

    const { account: freshAccount } = await refreshAccountToken(freshUser, freshMain.accountId);
    if (!freshAccount) return;

    const freshSlots = await fetchLoadoutSlots(
      freshAccount.accountId,
      freshAccount.accessToken,
      lang,
    );
    const freshAuthor = await getEpicAuthor(discordId, {
      accountId: freshAccount.accountId,
      accessToken: freshAccount.accessToken,
      displayName: freshAccount.displayName || freshMain.displayName || 'Unknown',
    });

    let selectedGuid: string | null = null;
    let statusMessage: string | undefined;

    const hubOpts = {
      lang,
      locale,
      authorData: freshAuthor,
      accountId: freshAccount.accountId,
      accessToken: freshAccount.accessToken,
      discordId,
      statusMessage,
    };

    if (parsed.action === 'pick' && parsed.loadoutGuid) {
      selectedGuid = parsed.loadoutGuid;

      try {
        const loadingHub = await renderLoadoutsHub(
          interaction,
          sessionId,
          freshSlots,
          selectedGuid,
          { ...hubOpts, previewPhase: 'loading' },
        );
        await applyHubToMessage(componentInteraction.message, loadingHub);

        const readyHub = await renderLoadoutsHub(
          interaction,
          sessionId,
          freshSlots,
          selectedGuid,
          { ...hubOpts, previewPhase: 'ready' },
        );
        await applyHubToMessage(componentInteraction.message, readyHub);
      } catch (err) {
        log.commands.warn({ err, discordId, loadout: selectedGuid }, '[LOADOUTS] Preview failed');
        const errHub = await renderLoadoutsHub(
          interaction,
          sessionId,
          freshSlots,
          selectedGuid,
          {
            ...hubOpts,
            previewPhase: 'list',
            statusMessage: await translateForUser(discordId, 'loadout.image.error', undefined, locale),
          },
        );
        await applyHubToMessage(componentInteraction.message, errHub).catch(() => null);
      }
      return;
    } else if (parsed.action === 'back') {
      selectedGuid = null;
    }

    const nextHub = await renderLoadoutsHub(
      interaction,
      sessionId,
      freshSlots,
      selectedGuid,
      {
        ...hubOpts,
        previewPhase: selectedGuid ? 'ready' : 'list',
      },
    );

    await applyHubToMessage(componentInteraction.message, nextHub);
  });

  collector.on('end', async (_, reason) => {
    if (!isCollectorIdle(reason)) return;
    try {
      const inactive = await translateForUser(discordId, 'epic.inactivePanel', undefined, locale);
      await editMessageInactive(message, inactive);
    } catch {
      // ignore
    }
  });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('loadouts')
    .setDescription('Manage and share your STW hero loadouts')
    .setNameLocalizations(buildDiscordLocalizations('loadouts.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('loadouts.cmd._1')) as SlashCommandBuilder,

  auth: true,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction) {
    await handleLoadouts(interaction);
  },
};

export default command;
