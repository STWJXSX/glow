import { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
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

interface Sidekick {
  name: string;
  id: string;
}

let sidekickCache: Record<string, Sidekick[]> = {};
let sidekickCacheExpiry: Record<string, number> = {};

async function getSidekicks(language: string): Promise<Sidekick[]> {
  if (sidekickCache[language]?.length && Date.now() < (sidekickCacheExpiry[language] || 0)) {
    return sidekickCache[language];
  }

  try {
    const res = await axios.get('https://fortnite-api.com/v2/cosmetics/br/search/all', {
      params: { type: 'sidekick', language },
      timeout: 10000,
    });

    sidekickCache[language] = (res.data?.data ?? [])
      .map((item: any) => ({ id: item.id, name: item.name || item.id }))
      .filter((s: Sidekick) => s.id && s.name)
      .sort((a: Sidekick, b: Sidekick) => a.name.localeCompare(b.name));

    sidekickCacheExpiry[language] = Date.now() + 30 * 60 * 1000;
    return sidekickCache[language];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP MIMOSA] Error fetching sidekicks:', error.message);
    return [];
  }
}

export async function handleMimosaAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'companero') return;

    const sidekicks = await getSidekicks(apiLang);
    if (!sidekicks.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.mimosa.errors.autocompleteLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focused.value.toLowerCase();
    const filtered = sidekicks
      .filter((s) => s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query))
      .slice(0, 25)
      .map((s) => ({ name: s.name, value: s.id }));

    await interaction.respond(filtered);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP MIMOSA] Autocomplete error:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.mimosa.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleMimosa(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const companionId = interaction.options.getString('companero', true);
    if (companionId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.mimosa.errors.apiLoad', undefined, interaction.locale),
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

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const sidekicks = await getSidekicks(apiLang);
    const selected = sidekicks.find((s) => s.id === companionId);
    const companionName = selected?.name || companionId;

    await callCore('ghostequip.mimosa', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      companionId,
    });

    const author = await getEpicAuthor(userId);
    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.mimosa.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(
        userId,
        'ghostequip.mimosa.success.description',
        { companionName },
        interaction.locale,
      ),
      image: `https://fortnite-api.com/images/cosmetics/br/${companionId}/smallicon.png`,
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP MIMOSA] Error');

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
