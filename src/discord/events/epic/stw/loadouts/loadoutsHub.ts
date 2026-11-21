/**
 * Modal submit for /loadouts community upload.
 */

import { Events, ModalSubmitInteraction } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { getUserLanguage, translate } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { createErrorEmbed, createSuccessEmbed } from '#helpers/core/embedHelper.ts';
import {
  LOADOUTS_MODAL_PREFIX,
  publishLoadoutToCommunity,
  refreshLoadoutsHubPanel,
} from '#commands/epic/stw/loadouts.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(client: ExtendedClient, interaction) {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith(`${LOADOUTS_MODAL_PREFIX}|`)) return;

    await interaction.deferReply({ ephemeral: true });

    const lang = (await getUserLanguage(interaction.user.id)) as SupportedLanguage;
    const discordId = interaction.user.id;
    const parts = interaction.customId.split('|');
    const sessionId = parts[1];
    const loadoutGUID = parts.slice(2).join('|');
    const presetName = interaction.fields.getTextInputValue('preset_name').trim();

    if (!sessionId || !loadoutGUID || presetName.length < 3) {
      await interaction.editReply({
        content: translate('loadouts.hub.uploadNameInvalid', lang),
      });
      return;
    }

    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
    if (!userInfo || !mainAccount) {
      await interaction.editReply({ content: translate('hero.errors.noMain', lang) });
      return;
    }

    const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
    if (!account) {
      await interaction.editReply({ content: translate('hero.errors.noAccount', lang) });
      return;
    }

    const result = await publishLoadoutToCommunity({
      discordId,
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName || mainAccount.displayName || 'Unknown',
      loadoutGUID,
      presetName,
      lang,
      client: interaction.client,
    });

    const authorData = await getMainAccountAuthor(discordId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName || mainAccount.displayName || 'Unknown',
    });

    if (!result.ok) {
      const errEmbed = await createErrorEmbed({
        description: result.error ?? translate('loadout.image.error', lang),
        author: authorData ?? undefined,
      });
      await interaction.editReply({ embeds: [errEmbed], content: null });
      return;
    }

    const emojiSuccess = getEmoji(client, 'success');
    const successEmbed = await createSuccessEmbed({
      description: translate('loadouts.hub.uploadSuccess', lang, {
        emoji: emojiSuccess,
        name: presetName,
        id: result.publicId ?? '',
      }),
      author: authorData ?? undefined,
    });
    await interaction.editReply({ embeds: [successEmbed], content: null });

    const reply = await interaction.fetchReply();
    setTimeout(() => {
      reply.delete().catch(() => null);
    }, 8000);

    const hubMessage = interaction.message;
    if (hubMessage?.editable && sessionId && loadoutGUID) {
      await refreshLoadoutsHubPanel({
        message: hubMessage,
        sessionId,
        loadoutGUID,
        lang,
        discordId,
        accountId: account.accountId,
        accessToken: account.accessToken,
        authorData: authorData ?? null,
        locale: interaction.locale,
      }).catch(() => null);
    }
  },
};

export default event;
