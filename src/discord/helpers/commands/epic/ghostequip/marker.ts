import { ChatInputCommandInteraction } from 'discord.js';
import { callCore } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { editFakeReply, fakeSuccessDescription } from './fakeReply.ts';

const MARKER_ACTIONS = {
  set: { isSet: true, labelKey: 'ghostequip.marker.presets.set' },
  clear: { isSet: false, labelKey: 'ghostequip.marker.presets.clear' },
} as const;

export const MARKER_CHOICE_VALUES = Object.keys(MARKER_ACTIONS);

export async function handleMarker(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const actionKey = interaction.options.getString('ubicacion', true);
    const action = MARKER_ACTIONS[actionKey as keyof typeof MARKER_ACTIONS];
    if (!action) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        description: await translateForUser(userId, 'ghostequip.marker.errors.invalidPreset', undefined, interaction.locale),
      });
      return;
    }

    const user = await UsuarioInfo.findOne({ id: userId });
    const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    await callCore('fake.marker', {
      userId,
      accountId: mainAccount.accountId,
      isSet: action.isSet,
    });

    const locationLabel = await translateForUser(userId, action.labelKey, undefined, interaction.locale);
    const author = await getEpicAuthor(userId);

    await editFakeReply(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.marker.success.title', undefined, interaction.locale),
      description: await fakeSuccessDescription(
        userId,
        'ghostequip.marker.success.description',
        { location: locationLabel },
        interaction.locale,
      ),
      author,
    });
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP MARKER] Error');

    if (error.message === 'noCuenta' || error.message === 'noMain') {
      await replyEpicCredentialError(interaction, userId, error.message);
      return;
    }

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.common.errors.partyNotFound.descriptionAccount', {
          displayName: '?',
        }, interaction.locale),
        fields: [{
          name: epicSection(await translateForUser(userId, 'ghostequip.common.errors.suggestion.title', undefined, interaction.locale)),
          value: await translateForUser(userId, 'ghostequip.common.errors.suggestion.activeParty', undefined, interaction.locale),
          inline: false,
        }],
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
