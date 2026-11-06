import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import axios from 'axios';
import { callCore } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import {
  buildEpicReplyPayload,
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { ghostequipSuccessDescription } from './embedText.ts';

interface Emote {
  name: string;
  id: string;
  rarity: string;
  set: string | null;
}

let emotesCache: Record<string, Emote[]> = {};
let cacheExpiry: Record<string, number> = {};

async function getEmotes(userLocale: string = 'en'): Promise<Emote[]> {
  const cacheKey = userLocale;

  if (emotesCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return emotesCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics', {
      params: { language: userLocale },
      timeout: 10000,
    });

    if (response.data?.status === 200 && response.data?.data) {
      const allCosmetics = response.data.data.br;
      if (!Array.isArray(allCosmetics)) return [];

      emotesCache[cacheKey] = allCosmetics
        .filter((item: any) => item.type?.value === 'emote')
        .map((item: any) => ({
          name: item.name,
          id: item.id,
          rarity: item.rarity?.displayValue || 'Común',
          set: item.set?.text || null,
        }))
        .filter((emote: Emote) => emote.id && emote.name)
        .sort((a: Emote, b: Emote) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + 30 * 60 * 1000;
      return emotesCache[cacheKey];
    }
    return [];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP EMOTE] Error obteniendo emotes:', error.message);
    return [];
  }
}

export async function handleEmoteAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'baile' && focusedOption.name !== 'emote') return;

    const emotes = await getEmotes(apiLang);
    if (!emotes.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.emote.errors.autocompleteLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focusedOption.value.toLowerCase();
    let filtered = emotes;

    if (query.length > 0) {
      filtered = emotes.filter(
        (emote) =>
          emote.name.toLowerCase().includes(query) ||
          emote.id.toLowerCase().includes(query),
      );
    }

    if (filtered.length === 0 && query.length > 0) {
      filtered = emotes.slice(0, 25);
    }

    await interaction.respond(
      filtered.slice(0, 25).map((emote) => ({
        name: `${emote.name} (${emote.rarity})`,
        value: emote.id,
      })),
    );
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP EMOTE] Error en autocompletado:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.emote.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleEmote(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const user = await UsuarioInfo.findOne({ id: userId });
  const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

  try {
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId);
    const emoteId = interaction.options.getString('baile', true);

    if (emoteId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.emote.errors.apiLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const emotes = await getEmotes(apiLang);
    const selectedEmote = emotes.find((emote) => emote.id === emoteId);
    const emoteName = selectedEmote?.name || emoteId;

    await callCore('ghostequip.emote', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      emoteId,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.emote.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.emote.success.description', { emoteName }, interaction.locale),
      image: `https://fortnite-api.com/images/cosmetics/br/${emoteId}/smallicon.png`,
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP EMOTE] Error:', error);

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(
          userId,
          'ghostequip.common.errors.partyNotFound.descriptionAccount',
          { displayName: mainAccount?.displayName || '?' },
          interaction.locale,
        ),
        fields: [{
          name: epicSection(await translateForUser(userId, 'ghostequip.common.errors.suggestion.title', undefined, interaction.locale)),
          value: await translateForUser(userId, 'ghostequip.common.errors.suggestion.activeParty', undefined, interaction.locale),
          inline: false,
        }],
      });
      return;
    }

    if (error.message === 'Party permission error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.noPermissions.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.common.errors.noPermissions.descriptionModify', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
