/**
 * COMANDO /taxiprem — Dashboard de taxi personal premium.
 *
 * Panel único con botones + modales, siguiendo el patrón de autoconfig.ts.
 * Usa la cuenta principal del usuario (UsuarioInfo) como taxi.
 * Requiere aceptar TOS antes del primer uso.
 * Se apaga automáticamente tras 1 hora sin invitaciones.
 *
 * Components V2, i18n, auth:true, premMonthly:true.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { createV2Container } from '#helpers/core/embedHelper.ts';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, getUserLanguage, translate, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getEpicAuthor } from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_CONFIRM_IDLE_MS,
  EPIC_PANEL_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import TaxiPrem from '#models/TaxiPrem.ts';
import { callCore } from '#api/glowCore.ts';

// ── Helpers ──────────────────────────────────────────────────

function t(key: string, lang: SupportedLanguage, replacements?: Record<string, string | number>) {
  return translate(`taxiprem.${key}`, lang, replacements);
}

async function replyV2(interaction: ChatInputCommandInteraction, containers: ContainerBuilder[]): Promise<void> {
  await interaction.editReply({
    embeds: [],
    components: containers.map(c => c.toJSON() as any),
    flags: MessageFlags.IsComponentsV2,
  } as any);
}

function replyError(interaction: ChatInputCommandInteraction, client: any, msg: string): Promise<void> {
  const errorEmoji = getEmoji(client, 'error');
  const container = createV2Container('error')
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${errorEmoji} ${msg}`));
  return replyV2(interaction, [container]) as any;
}

// ── TOS Panel ────────────────────────────────────────────────

async function showTOSPanel(
  interaction: ChatInputCommandInteraction,
  lang: SupportedLanguage,
  mainAccount: any,
): Promise<boolean> {
  const emojiWarning = getEmoji(interaction.client, 'warning');
  const emojiInfo = getEmoji(interaction.client, 'info');

  const tosContainer = createV2Container('warning')
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${emojiWarning} ${t('tos.title', lang)}\n\n` +
        `${t('tos.body', lang)}\n\n` +
        `${emojiInfo} ${t('tos.recommendation', lang)}`
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('taxiprem_tos_accept')
          .setLabel(t('tos.acceptButton', lang))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('taxiprem_tos_decline')
          .setLabel(t('tos.declineButton', lang))
          .setStyle(ButtonStyle.Danger),
      ),
    );

  await replyV2(interaction, [tosContainer]);

  const message = await interaction.fetchReply();
  try {
    const btnInteraction = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      idle: EPIC_CONFIRM_IDLE_MS,
    });

    await btnInteraction.deferUpdate();

    if (btnInteraction.customId === 'taxiprem_tos_accept') {
      return true;
    }

    // Declined
    const declinedContainer = createV2Container('error')
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${getEmoji(interaction.client, 'error')} ${t('tos.declined', lang)}`),
      );
    await replyV2(interaction, [declinedContainer]);
    return false;
  } catch {
    // Timeout
    const timeoutContainer = createV2Container('info')
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(await translateForUser(interaction.user.id, 'epic.inactiveConfirm', undefined, interaction.locale)),
      );
    await replyV2(interaction, [timeoutContainer]);
    return false;
  }
}

// ── Dashboard Panel ──────────────────────────────────────────

async function buildPanelContainers(
  interaction: ChatInputCommandInteraction,
  config: any,
  disabled = false,
  loadingButton: string | null = null,
): Promise<ContainerBuilder[]> {
  const lang: SupportedLanguage = (await getUserLanguage(interaction.user.id)) as SupportedLanguage;
  const emojiActive = getEmoji(interaction.client, 'active');
  const emojiInactive = getEmoji(interaction.client, 'inactive');
  const emojiPremium = getEmoji(interaction.client, 'premium');
  const emojiLoading = getEmoji(interaction.client, 'loading');

  const taxiStatus = await callCore<{ running: boolean; status: { occupied: boolean; queueSize: number } | null }>(
    'taxiprem.status',
    interaction.user.id,
  );
  const running = taxiStatus.running;
  const status = taxiStatus.status;

  const authorData = await getEpicAuthor(interaction.user.id);

  // ── Header section
  const container = createV2Container('success');
  const accountName = authorData?.name || config.accountId;

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${accountName}\n## ${t('panel.header', lang)}`,
      ),
    );
  if (authorData?.iconURL) {
    headerSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(authorData.iconURL));
  }
  container.addSectionComponents(headerSection);

  // ── Status lines
  const statusEmoji = running ? emojiActive : emojiInactive;
  const statusText = running ? t('panel.statusOnline', lang) : t('panel.statusOffline', lang);
  const autoAcceptText = config.autoAcceptFriends ? `${emojiActive} ${t('panel.autoAcceptOn', lang)}` : `${emojiInactive} ${t('panel.autoAcceptOff', lang)}`;
  const modeText = config.isPublic ? t('panel.public', lang) : t('panel.private', lang);
  const occupiedText = status?.occupied ? t('panel.occupied', lang) : t('panel.free', lang);
  const queueText = status ? ` | ${t('panel.queue', lang, { count: status.queueSize })}` : '';

  const lines = [
    `**${t('panel.statusLabel', lang)}:** ${statusEmoji} ${statusText}${running ? ` (${occupiedText}${queueText})` : ''}`,
    `**${t('panel.autoAcceptLabel', lang)}:** ${autoAcceptText}`,
    `**${t('panel.timeoutLabel', lang)}:** ${config.sessionTimeout} min`,
    `**${t('panel.powerLabel', lang)}:** ${config.powerLevel}`,
    `**${t('panel.levelLabel', lang)}:** ${config.displayLevel}`,
    `**${t('panel.modeLabel', lang)}:** ${modeText} (${config.whitelist.length} WL)`,
  ];
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  container.addSeparatorComponents(new SeparatorBuilder());

  // ── Presences section
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**${t('panel.presencesLabel', lang)}**\n` +
      `${getEmoji(interaction.client, 'active')} ${config.presences.available}\n` +
      `${getEmoji(interaction.client, 'inactive')} ${config.presences.busy}`,
    ),
  );

  // ── Cosmetics section
  const premiumPrefix = emojiPremium ? `${emojiPremium} ` : '';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**${t('panel.cosmeticsLabel', lang)}**\n` +
      `${premiumPrefix}**Skin:** \`${config.cosmetics.skinId}\`\n` +
      `${premiumPrefix}**Banner:** \`${config.cosmetics.bannerId}\`\n` +
      `${premiumPrefix}**Dance:** \`${config.cosmetics.emoteId}\``,
    ),
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // ── Info note
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${t('panel.infoNote', lang)}`),
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // ── Buttons row 1: Activate / Restart / Deactivate
  const isLoading = (id: string) => loadingButton === id;

  const toggleButton = running
    ? new ButtonBuilder()
        .setCustomId('taxiprem_deactivate')
        .setLabel(t('buttons.deactivate', lang))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled || isLoading('taxiprem_deactivate'))
    : new ButtonBuilder()
        .setCustomId('taxiprem_activate')
        .setLabel(t('buttons.activate', lang))
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || isLoading('taxiprem_activate'));

  const restartButton = new ButtonBuilder()
    .setCustomId('taxiprem_restart')
    .setLabel(t('buttons.restart', lang))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled || !running || isLoading('taxiprem_restart'));

  const deleteButton = new ButtonBuilder()
    .setCustomId('taxiprem_delete')
    .setLabel(t('buttons.delete', lang))
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled || running || isLoading('taxiprem_delete'));

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(toggleButton, restartButton, deleteButton),
  );

  // ── Buttons row 2: Edit Presences / Personalize / Edit Power / Auto-Accept Toggle
  const presencesButton = new ButtonBuilder()
    .setCustomId('taxiprem_presences')
    .setLabel(t('buttons.editPresences', lang))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || isLoading('taxiprem_presences'));

  const cosmeticsButton = new ButtonBuilder()
    .setCustomId('taxiprem_cosmetics')
    .setLabel(t('buttons.personalize', lang))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || isLoading('taxiprem_cosmetics'));

  const powerButton = new ButtonBuilder()
    .setCustomId('taxiprem_power')
    .setLabel(t('buttons.editPower', lang))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || isLoading('taxiprem_power'));

  const autoAcceptButton = new ButtonBuilder()
    .setCustomId('taxiprem_autoacceptfriends')
    .setLabel(config.autoAcceptFriends ? t('buttons.disableAutoAccept', lang) : t('buttons.enableAutoAccept', lang))
    .setStyle(config.autoAcceptFriends ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled || isLoading('taxiprem_autoacceptfriends'));

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(presencesButton, cosmeticsButton, powerButton, autoAcceptButton),
  );

  return [container];
}

async function showMainPanel(
  interaction: ChatInputCommandInteraction,
  config: any,
): Promise<void> {
  const containers = await buildPanelContainers(interaction, config);
  await replyV2(interaction, containers);

  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (btnInteraction: ButtonInteraction) => {
    if (btnInteraction.user.id !== interaction.user.id) {
      const btnLang: SupportedLanguage = (await getUserLanguage(btnInteraction.user.id)) as SupportedLanguage;
      await btnInteraction.reply({
        content: `${getEmoji(btnInteraction.client, 'error')} ${t('errors.onlyAuthor', btnLang)}`,
        ephemeral: true,
      });
      return;
    }

    await handleButton(btnInteraction, interaction, config);
  });

  collector.on('end', async (_collected, reason) => {
    if (!isCollectorIdle(reason)) return;
    try {
      const inactive = await translateForUser(interaction.user.id, 'epic.inactivePanel', undefined, interaction.locale);
      await editReplyInactive(interaction, inactive);
    } catch { /* panel expired */ }
  });
}

// ── Button handler ───────────────────────────────────────────

async function handleButton(
  btnInteraction: ButtonInteraction,
  originalInteraction: ChatInputCommandInteraction,
  config: any,
): Promise<void> {
  const id = btnInteraction.customId;
  const lang: SupportedLanguage = (await getUserLanguage(btnInteraction.user.id)) as SupportedLanguage;

  // Modal flows: don't deferUpdate — need to show modal
  const isModalFlow = id === 'taxiprem_presences' || id === 'taxiprem_cosmetics' || id === 'taxiprem_power';

  if (!isModalFlow) {
    await btnInteraction.deferUpdate();
  }

  // Re-fetch config for freshness
  const freshConfig = await TaxiPrem.findOne({ discordId: btnInteraction.user.id });
  if (!freshConfig) return;

  switch (id) {
    case 'taxiprem_activate': {
      const result = await callCore<{ success: boolean; error?: string }>('taxiprem.start', btnInteraction.user.id);
      if (!result.success) {
        // Show error briefly, then refresh panel
        log.epic.warn({ error: result.error, discordId: btnInteraction.user.id }, '[TaxiPrem] Error activando');
      }
      break;
    }

    case 'taxiprem_deactivate': {
      await callCore('taxiprem.stop', btnInteraction.user.id, 'manual');
      break;
    }

    case 'taxiprem_restart': {
      await callCore('taxiprem.stop', btnInteraction.user.id, 'restart');
      await new Promise(r => setTimeout(r, 1000));
      await callCore('taxiprem.start', btnInteraction.user.id);
      break;
    }

    case 'taxiprem_delete': {
      const taxiStatus = await callCore<{ running: boolean }>('taxiprem.status', btnInteraction.user.id);
      if (taxiStatus.running) {
        await callCore('taxiprem.stop', btnInteraction.user.id, 'delete');
      }
      await TaxiPrem.deleteOne({ discordId: btnInteraction.user.id });
      const deletedContainer = createV2Container('success')
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${getEmoji(btnInteraction.client, 'success')} ${t('delete.description', lang)}`),
        );
      await replyV2(originalInteraction, [deletedContainer]);
      return; // no panel refresh
    }

    case 'taxiprem_autoacceptfriends': {
      freshConfig.autoAcceptFriends = !freshConfig.autoAcceptFriends;
      await freshConfig.save();
      await callCore('taxiprem.reload', btnInteraction.user.id);
      break;
    }

    case 'taxiprem_presences': {
      const modal = new ModalBuilder()
        .setCustomId('taxiprem_modal_presences')
        .setTitle(t('modals.presences.title', lang));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('available')
            .setLabel(t('modals.presences.availableLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(freshConfig.presences.available)
            .setRequired(true)
            .setMaxLength(128),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('busy')
            .setLabel(t('modals.presences.busyLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(freshConfig.presences.busy)
            .setRequired(true)
            .setMaxLength(128),
        ),
      );

      await btnInteraction.showModal(modal);

      try {
        const modalSubmit = await btnInteraction.awaitModalSubmit({
          filter: (i) => i.customId === 'taxiprem_modal_presences' && i.user.id === btnInteraction.user.id,
          time: EPIC_CONFIRM_IDLE_MS,
        });
        await modalSubmit.deferUpdate();

        freshConfig.presences.available = modalSubmit.fields.getTextInputValue('available');
        freshConfig.presences.busy = modalSubmit.fields.getTextInputValue('busy');
        await freshConfig.save();
        await callCore('taxiprem.reload', btnInteraction.user.id);
        await callCore('taxiprem.reapplyPresence', btnInteraction.user.id);
      } catch {
        // Modal timeout — just refresh panel
      }
      break;
    }

    case 'taxiprem_cosmetics': {
      const modal = new ModalBuilder()
        .setCustomId('taxiprem_modal_cosmetics')
        .setTitle(t('modals.cosmetics.title', lang));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('skin')
            .setLabel(t('modals.cosmetics.skinLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(freshConfig.cosmetics.skinId)
            .setRequired(false)
            .setMaxLength(128),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('banner')
            .setLabel(t('modals.cosmetics.bannerLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(freshConfig.cosmetics.bannerId)
            .setRequired(false)
            .setMaxLength(128),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('emote')
            .setLabel(t('modals.cosmetics.emoteLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(freshConfig.cosmetics.emoteId)
            .setRequired(false)
            .setMaxLength(128),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('level')
            .setLabel(t('modals.cosmetics.levelLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(String(freshConfig.displayLevel))
            .setRequired(false)
            .setMaxLength(6),
        ),
      );

      await btnInteraction.showModal(modal);

      try {
        const modalSubmit = await btnInteraction.awaitModalSubmit({
          filter: (i) => i.customId === 'taxiprem_modal_cosmetics' && i.user.id === btnInteraction.user.id,
          time: EPIC_CONFIRM_IDLE_MS,
        });
        await modalSubmit.deferUpdate();

        const skinVal = modalSubmit.fields.getTextInputValue('skin').trim();
        const bannerVal = modalSubmit.fields.getTextInputValue('banner').trim();
        const emoteVal = modalSubmit.fields.getTextInputValue('emote').trim();
        const levelVal = modalSubmit.fields.getTextInputValue('level').trim();

        if (skinVal) freshConfig.cosmetics.skinId = skinVal;
        if (bannerVal) freshConfig.cosmetics.bannerId = bannerVal;
        if (emoteVal) freshConfig.cosmetics.emoteId = emoteVal;
        if (levelVal) {
          const parsed = parseInt(levelVal, 10);
          if (!isNaN(parsed) && parsed > 0) freshConfig.displayLevel = parsed;
        }

        await freshConfig.save();
        await callCore('taxiprem.reload', btnInteraction.user.id);
        await callCore('taxiprem.reapplyCosmetics', btnInteraction.user.id);
      } catch {
        // Modal timeout
      }
      break;
    }

    case 'taxiprem_power': {
      const modal = new ModalBuilder()
        .setCustomId('taxiprem_modal_power')
        .setTitle(t('modals.power.title', lang));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('power')
            .setLabel(t('modals.power.powerLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(String(freshConfig.powerLevel))
            .setRequired(true)
            .setMaxLength(6),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('timeout')
            .setLabel(t('modals.power.timeoutLabel', lang))
            .setStyle(TextInputStyle.Short)
            .setValue(String(freshConfig.sessionTimeout))
            .setRequired(true)
            .setMaxLength(4),
        ),
      );

      await btnInteraction.showModal(modal);

      try {
        const modalSubmit = await btnInteraction.awaitModalSubmit({
          filter: (i) => i.customId === 'taxiprem_modal_power' && i.user.id === btnInteraction.user.id,
          time: EPIC_CONFIRM_IDLE_MS,
        });
        await modalSubmit.deferUpdate();

        const powerVal = parseInt(modalSubmit.fields.getTextInputValue('power').trim(), 10);
        const timeoutVal = parseInt(modalSubmit.fields.getTextInputValue('timeout').trim(), 10);

        if (!isNaN(powerVal) && powerVal > 0 && powerVal <= 99999) {
          freshConfig.powerLevel = powerVal;
        }
        if (!isNaN(timeoutVal) && timeoutVal >= 1 && timeoutVal <= 30) {
          freshConfig.sessionTimeout = timeoutVal;
        }

        await freshConfig.save();
        await callCore('taxiprem.reload', btnInteraction.user.id);
      } catch {
        // Modal timeout
      }
      break;
    }
  }

  // Refresh panel
  await new Promise(r => setTimeout(r, 500));
  const updatedConfig = await TaxiPrem.findOne({ discordId: btnInteraction.user.id });
  if (updatedConfig) {
    const panels = await buildPanelContainers(originalInteraction, updatedConfig);
    await replyV2(originalInteraction, panels);
  }
}

// ── Command definition ───────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('taxiprem')
    .setDescription('Personal taxi bot dashboard')
    .setNameLocalizations(buildDiscordLocalizations('taxiprem.cmd.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('taxiprem.cmd._1')) as unknown as SlashCommandBuilder,

  auth: true,
  automationSystem: 'autoacceptfriends',
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const discordId = interaction.user.id;
      const lang: SupportedLanguage = (await getUserLanguage(discordId)) as SupportedLanguage;

      // Get main account
      const userInfo = await UsuarioInfo.findOne({ id: discordId });
      if (!userInfo) {
        await replyError(interaction, interaction.client, t('errors.noAccount', lang));
        return;
      }

      const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
      if (!mainAccount) {
        await replyError(interaction, interaction.client, t('errors.noMainAccount', lang));
        return;
      }

      // Check if config exists
      let config = await TaxiPrem.findOne({ discordId });

      if (!config) {
        // First time → show TOS
        const accepted = await showTOSPanel(interaction, lang, mainAccount);
        if (!accepted) return;

        // Create config
        config = await TaxiPrem.create({
          discordId,
          accountId: mainAccount.accountId,
          acceptedTOS: true,
        });
      } else if (!config.acceptedTOS) {
        // Config exists but TOS not accepted
        const accepted = await showTOSPanel(interaction, lang, mainAccount);
        if (!accepted) return;

        config.acceptedTOS = true;
        await config.save();
      }

      // Show dashboard
      await showMainPanel(interaction, config);
    } catch (err: any) {
      log.epic.error({ error: err, userId: interaction.user.id }, '[TaxiPrem] Error en comando');
      const errorEmoji = getEmoji(interaction.client, 'error');
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${errorEmoji} An unexpected error occurred.`),
      );
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
  },
};

export default command;
