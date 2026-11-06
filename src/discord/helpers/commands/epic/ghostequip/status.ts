import { ChatInputCommandInteraction, Client } from 'discord.js';
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

const STATUS_CHOICES: Record<string, 'Ready' | 'NotReady' | 'SittingOut'> = {
  ready: 'Ready',
  notready: 'NotReady',
  sittingout: 'SittingOut',
};

type PartyAccount = {
  accountId: string;
  accessToken: string;
  displayName: string;
};

async function replyPartyNotFound(
  interaction: ChatInputCommandInteraction,
  userId: string,
  client: Client,
  displayName?: string,
): Promise<void> {
  await replyWithEpicEmbed(interaction, userId, {
    style: 'warning',
    title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
    description: await translateForUser(
      userId,
      'ghostequip.common.errors.partyNotFound.descriptionAccount',
      { displayName: displayName || '?' },
      interaction.locale,
    ),
    fields: [{
      name: epicSection(await translateForUser(userId, 'ghostequip.common.errors.suggestion.title', undefined, interaction.locale)),
      value: await translateForUser(userId, 'ghostequip.common.errors.suggestion.activeParty', undefined, interaction.locale),
      inline: false,
    }],
  });
}

async function runWithParty(
  interaction: ChatInputCommandInteraction,
  action: (account: PartyAccount) => Promise<void>,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
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

  try {
    await action({
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });
  } catch (error: any) {
    if (error.message === 'Party not found') {
      await replyPartyNotFound(interaction, userId, client, mainAccount?.displayName);
      return;
    }
    log.epic.error({ error, userId }, '[GHOST EQUIP STATUS] Error');
    await replyEpicApiError(interaction, userId, error);
  }
}

export async function handleReady(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  await runWithParty(interaction, async (account) => {
    const estadoRaw = interaction.options.getString('estado', true);
    const status = STATUS_CHOICES[estadoRaw] ?? 'NotReady';

    await callCore('fake.ready', { userId, ...account, status });

    const statusLabel = await translateForUser(
      userId,
      `ghostequip.status.choices.${estadoRaw}`,
      undefined,
      interaction.locale,
    );

    const author = await getEpicAuthor(userId);
    await editFakeReply(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.status.ready.success.title', undefined, interaction.locale),
      description: await fakeSuccessDescription(userId, 'ghostequip.status.ready.success.description', { status: statusLabel }, interaction.locale),
      author,
    });
  });
}

export async function handlePlaying(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  await runWithParty(interaction, async (account) => {
    const playerCount = interaction.options.getInteger('jugadores') ?? 100;

    await callCore('fake.playing', { userId, ...account, playerCount });

    const author = await getEpicAuthor(userId);
    await editFakeReply(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.status.playing.success.title', undefined, interaction.locale),
      description: await fakeSuccessDescription(userId, 'ghostequip.status.playing.success.description', { players: String(playerCount) }, interaction.locale),
      author,
    });
  });
}

export async function handleLobby(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  await runWithParty(interaction, async (account) => {
    await callCore('fake.lobby', { userId, ...account });

    const author = await getEpicAuthor(userId);
    await editFakeReply(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.status.lobby.success.title', undefined, interaction.locale),
      description: await fakeSuccessDescription(userId, 'ghostequip.status.lobby.success.description', undefined, interaction.locale),
      author,
    });
  });
}
