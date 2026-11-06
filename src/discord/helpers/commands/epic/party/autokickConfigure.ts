import {
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} from 'discord.js';
import { createV2Container } from '#helpers/core/embedHelper.ts';
import { EPIC_PANEL_IDLE_MS, editReplyInactive, isCollectorIdle } from '../epicCollectorHelper.ts';
import { log } from '#helpers/core/logger.ts';
import { getEmoji, getEmojiButtonComponent } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import AutoKick, { AUTOKICK_KICK_MODES, resolveKickMode, type AutoKickKickMode } from '#models/AutoKick.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

/**
 * Patches the original interaction reply with a V2 container.
 * Uses the raw REST endpoint to avoid Discord.js sending `embeds: []` in the body,
 * which Discord rejects when the message has IS_COMPONENTS_V2 flag.
 */
async function patchV2(interaction: ChatInputCommandInteraction, container: ContainerBuilder): Promise<void> {
  await (interaction.client.rest as any).patch(
    `/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
    {
      body: {
        flags: MessageFlags.IsComponentsV2,
        components: [container.toJSON()],
      },
    }
  );
}

/**
 * Handler para configurar AutoKick
 * Permite al usuario personalizar todas las opciones del AutoKick mediante botones
 */
export async function handleAutokickConfigure(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const client = interaction.client;
  const userId = interaction.user.id;

  // Immediately acknowledge with a V2 message so subsequent editReplies can use V2 components
  const loadingEmoji = getEmoji(client, 'loading');
  try {
    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(loadingEmoji)),
      ],
    });
  } catch (replyErr) {
    log.epic.error({ userId, error: replyErr }, 'Error enviando respuesta inicial V2 en autokick configure');
    return;
  }

  try {
    // Obtener emojis
    const emojiSuccess = getEmoji(client, 'success');
    const emojiError = getEmoji(client, 'error');
    const emojiWarning = getEmoji(client, 'warning');
    const emojiMaterials = getEmoji(client, 'materials');
    const emojiSave = getEmoji(client, 'save');
    // const emojiKick = getEmoji(client, 'kick'); // "Expulsar Miembros" retirado
    const emojiRewards = getEmoji(client, 'rewards');
    const emojiLeave = getEmoji(client, 'leave');
    const emojiReinvite = getEmoji(client, 'reinvite');
    const emojiEmbed = getEmoji(client, 'discord');

    // Verificar que el usuario tiene cuenta principal
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
      const title = await translateForUser(
        userId,
        'party.autokick.activar.errors.noAccount.title',
        { emoji: emojiError }
      );
      const description = await translateForUser(
        userId,
        'party.autokick.activar.errors.noAccount.description'
      );
      const errContainer = new ContainerBuilder()
        
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`));
      await patchV2(interaction, errContainer);
      return;
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      const title = await translateForUser(
        userId,
        'party.autokick.activar.errors.noMain.title',
        { emoji: emojiError }
      );
      const description = await translateForUser(
        userId,
        'party.autokick.activar.errors.noMain.description'
      );
      const errContainer = new ContainerBuilder()
        
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`));
      await patchV2(interaction, errContainer);
      return;
    }

    // Verificar si la cuenta está en AutoKick y activa
    const autoKickEntry = await AutoKick.findOne({ discordId: userId });
    const accountData = autoKickEntry?.accounts?.get(mainAccount.accountId);

    if (!autoKickEntry || !accountData || !accountData.isActive) {
      const title = await translateForUser(
        userId,
        'party.autokick.configurar.embed.notActive.title',
        { emoji: emojiWarning }
      );
      const description = await translateForUser(
        userId,
        'party.autokick.configurar.embed.notActive.description',
        { displayName: mainAccount.displayName }
      );
      const infoContainer = new ContainerBuilder()
        
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${description}`));
      await patchV2(interaction, infoContainer);
      return;
    }

    // Estado interno - Se mantiene durante toda la sesión
    let originalStates = {
      transferMaterials: accountData.transferMaterials || false,
      kickPartyMembers: accountData.kickPartyMembers || false,
      collectRewards: accountData.collectRewards !== undefined ? accountData.collectRewards : true,
      embedRewards: accountData.embedRewards !== undefined ? accountData.embedRewards : true,
      kickMode: resolveKickMode(accountData) as AutoKickKickMode,
      autoReinvite: accountData.autoReinvite || false,
    };

    let currentStates = { ...originalStates };
    let hasChanges = false;

    // Builds the Components V2 container for the config UI
    const createConfigContainer = async (
      states: typeof currentStates,
      hasUnsavedChanges = false,
      disabled = false
    ): Promise<ContainerBuilder> => {
      const changeIndicator = hasUnsavedChanges
        ? await translateForUser(userId, 'party.autokick.configurar.embed.unsavedChanges', { emoji: emojiWarning })
        : '';
      const title = await translateForUser(userId, 'party.autokick.configurar.embed.title', { changes: changeIndicator });
      const description = await translateForUser(userId, 'party.autokick.configurar.embed.description', { displayName: mainAccount.displayName });

      const container = createV2Container('info');
      const labelEnabled = await translateForUser(userId, 'party.panel.autoAcceptOn');
      const labelDisabled = await translateForUser(userId, 'party.panel.autoAcceptOff');
      const saveLabel = await translateForUser(userId, 'party.autokick.configurar.buttons.save');
      const successBtnEmoji = getEmojiButtonComponent('success');
      const errorBtnEmoji = getEmojiButtonComponent('error');

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());

      const addSection = (
        customId: string,
        sectionTitle: string,
        sectionDesc: string,
        isEnabled: boolean
      ) => {
        const toggleButton = new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(isEnabled ? labelEnabled : labelDisabled)
          .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled);
        const btnEmoji = isEnabled ? successBtnEmoji : errorBtnEmoji;
        if (btnEmoji) toggleButton.setEmoji(btnEmoji);

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${sectionTitle}**\n> ${sectionDesc}`)
            )
            .setButtonAccessory(toggleButton)
        );
      };

      const titleMaterials = await translateForUser(userId, 'party.autokick.configurar.embed.sections.transferMaterials.title', { emoji: emojiMaterials });
      const descMaterials = states.transferMaterials
        ? await translateForUser(userId, 'party.autokick.configurar.embed.sections.transferMaterials.enabled', { emoji: emojiSuccess })
        : await translateForUser(userId, 'party.autokick.configurar.embed.sections.transferMaterials.disabled', { emoji: emojiError });
      addSection('toggle_materials', titleMaterials, descMaterials, states.transferMaterials);

      // "Expulsar Miembros" retirado: ya no se usa (el kick de misión va por KickBot).
      // const titleKick = await translateForUser(userId, 'party.autokick.configurar.embed.sections.kickMembers.title', { emoji: emojiKick });
      // const descKick = states.kickPartyMembers
      //   ? await translateForUser(userId, 'party.autokick.configurar.embed.sections.kickMembers.enabled', { emoji: emojiSuccess })
      //   : await translateForUser(userId, 'party.autokick.configurar.embed.sections.kickMembers.disabled', { emoji: emojiError });
      // addSection('toggle_kick', titleKick, descKick, states.kickPartyMembers);

      const titleRewards = await translateForUser(userId, 'party.autokick.configurar.embed.sections.collectRewards.title', { emoji: emojiRewards });
      const descRewards = states.collectRewards
        ? await translateForUser(userId, 'party.autokick.configurar.embed.sections.collectRewards.enabled', { emoji: emojiSuccess })
        : await translateForUser(userId, 'party.autokick.configurar.embed.sections.collectRewards.disabled', { emoji: emojiError });
      addSection('toggle_rewards', titleRewards, descRewards, states.collectRewards);

      const titleEmbedRewards = await translateForUser(userId, 'party.autokick.configurar.embed.sections.embedRewards.title', { emoji: emojiEmbed });
      let descEmbedRewards: string;
      if (states.embedRewards && states.collectRewards) {
        descEmbedRewards = await translateForUser(userId, 'party.autokick.configurar.embed.sections.embedRewards.enabled', { emoji: emojiSuccess });
      } else if (states.embedRewards && !states.collectRewards) {
        descEmbedRewards = await translateForUser(userId, 'party.autokick.configurar.embed.sections.embedRewards.enabledRequirement', { emoji: emojiWarning });
      } else {
        descEmbedRewards = await translateForUser(userId, 'party.autokick.configurar.embed.sections.embedRewards.disabled', { emoji: emojiError });
      }
      addSection('toggle_embed', titleEmbedRewards, descEmbedRewards, states.embedRewards);

      // Expulsar de la misión: 3 modos (siempre / sin compañeros de party / nunca)
      const titleLeave = await translateForUser(userId, 'party.autokick.configurar.embed.sections.autoLeave.title', { emoji: emojiLeave });
      const modeEmoji = states.kickMode === 'never' ? emojiError : states.kickMode === 'noPartyMates' ? emojiWarning : emojiSuccess;
      const descLeave = await translateForUser(userId, `party.autokick.configurar.embed.sections.autoLeave.mode.${states.kickMode}`, { emoji: modeEmoji });
      const kickModeButton = new ButtonBuilder()
        .setCustomId('toggle_leave')
        .setLabel(await translateForUser(userId, `party.autokick.configurar.buttons.kickMode.${states.kickMode}`))
        .setStyle(states.kickMode === 'always' ? ButtonStyle.Success : states.kickMode === 'noPartyMates' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled);
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${titleLeave}**\n> ${descLeave}`))
          .setButtonAccessory(kickModeButton)
      );

      const titleReinvite = await translateForUser(userId, 'party.autokick.configurar.embed.sections.autoReinvite.title', { emoji: emojiReinvite });
      const descReinvite = states.autoReinvite
        ? await translateForUser(userId, 'party.autokick.configurar.embed.sections.autoReinvite.enabled', { emoji: emojiSuccess })
        : await translateForUser(userId, 'party.autokick.configurar.embed.sections.autoReinvite.disabled', { emoji: emojiError });
      addSection('toggle_reinvite', titleReinvite, descReinvite, states.autoReinvite);

      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('save')
            .setLabel(saveLabel)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!hasUnsavedChanges || disabled)
        )
      );
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.user.username}`)
      );

      return container;
    };

    // Mostrar configuración inicial
    const container = await createConfigContainer(currentStates, hasChanges);
    const response = await patchV2(interaction, container) as any;

    // Fetch the message to create a collector on it
    const message = await interaction.fetchReply();

    // Collector para manejar botones
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      idle: EPIC_PANEL_IDLE_MS,
    });

    const checkForChanges = (): boolean => {
      return JSON.stringify(currentStates) !== JSON.stringify(originalStates);
    };

    const updateInterface = async (buttonInteraction: any): Promise<void> => {
      hasChanges = checkForChanges();
      const newContainer = await createConfigContainer(currentStates, hasChanges);
      await buttonInteraction.deferUpdate();
      await patchV2(interaction, newContainer);
    };

    collector.on('collect', async (buttonInteraction) => {
      try {
        switch (buttonInteraction.customId) {
          case 'toggle_materials':
            currentStates.transferMaterials = !currentStates.transferMaterials;
            await updateInterface(buttonInteraction);
            break;

          // "Expulsar Miembros" retirado del panel
          // case 'toggle_kick':
          //   currentStates.kickPartyMembers = !currentStates.kickPartyMembers;
          //   await updateInterface(buttonInteraction);
          //   break;

          case 'toggle_rewards':
            currentStates.collectRewards = !currentStates.collectRewards;
            if (!currentStates.collectRewards && currentStates.embedRewards) {
              currentStates.embedRewards = false;
            }
            await updateInterface(buttonInteraction);
            break;

          case 'toggle_embed':
            currentStates.embedRewards = !currentStates.embedRewards;
            await updateInterface(buttonInteraction);
            break;

          case 'toggle_leave':
            currentStates.kickMode = AUTOKICK_KICK_MODES[
              (AUTOKICK_KICK_MODES.indexOf(currentStates.kickMode) + 1) % AUTOKICK_KICK_MODES.length
            ];
            await updateInterface(buttonInteraction);
            break;

          case 'toggle_reinvite':
            currentStates.autoReinvite = !currentStates.autoReinvite;
            await updateInterface(buttonInteraction);
            break;

          case 'save': {
            const updateData = {
              isActive: true,
              createdAt: accountData.createdAt || new Date(),
              lastActivity: new Date(),
              displayName: accountData.displayName || mainAccount.displayName,
              transferMaterials: currentStates.transferMaterials,
              kickPartyMembers: currentStates.kickPartyMembers,
              collectRewards: currentStates.collectRewards,
              embedRewards: currentStates.embedRewards,
              autoLeave: currentStates.kickMode !== 'never',
              kickMode: currentStates.kickMode,
              autoReinvite: currentStates.autoReinvite,
            };

            autoKickEntry.accounts.delete(mainAccount.accountId);
            autoKickEntry.accounts.set(mainAccount.accountId, updateData);
            autoKickEntry.markModified('accounts');
            await autoKickEntry.save();

            originalStates = { ...currentStates };

            const savedTitle = await translateForUser(
              userId,
              'party.autokick.configurar.embed.saved.title',
              { emoji: emojiSuccess }
            );

            const savedContainer = new ContainerBuilder()
              
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${savedTitle}`)
              );

            await buttonInteraction.deferUpdate();
            await patchV2(interaction, savedContainer);

            collector.stop('saved');

            try {
              if (typeof (global as any).updateAutoKick === 'function') {
                (global as any).updateAutoKick();
              }
            } catch (err) {
              log.epic.warn({ error: err }, 'Error enviando señal AutoKick');
            }

            break;
          }
        }
      } catch (error) {
        log.epic.error({ error }, 'Error procesando botón de configuración');
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'saved') return;
      if (!isCollectorIdle(reason)) return;
      try {
        const inactive = await translateForUser(userId, 'epic.inactivePanel', undefined, interaction.locale);
        await editReplyInactive(interaction, inactive);
      } catch (error) {
        log.epic.error({ error }, 'Error deshabilitando botones');
      }
    });
  } catch (error) {
    log.epic.error({ userId, error }, 'Error general en autokick configurar');

    const emojiError = getEmoji(client, 'error');
    const errorMsg = await translateForUser(userId, 'epic.errors.unexpected', undefined, interaction.locale);
    const errorContainer = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${emojiError} ${errorMsg}`),
      );
    try {
      await patchV2(interaction, errorContainer);
    } catch (editError) {
      log.epic.error({ error: editError }, 'Error enviando mensaje de error');
    }
  }
}
