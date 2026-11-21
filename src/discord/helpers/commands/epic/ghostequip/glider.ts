import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import axios from 'axios';
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
import { callCore } from '#api/glowCore.ts';
import { ghostequipSuccessDescription } from './embedText.ts';
import {
  cosmeticIconUrl,
  fetchCosmeticVariantDetail,
  pickVariantSelections,
} from './variants.ts';

interface Glider {
  name: string;
  id: string;
  rarity: string;
  set: string | null;
}

let glidersCache: Record<string, Glider[]> = {};
let cacheExpiry: Record<string, number> = {};

async function getGliders(userLocale: string = 'en'): Promise<Glider[]> {
  const cacheKey = userLocale;

  if (glidersCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return glidersCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics', {
      params: { language: userLocale },
      timeout: 10000,
    });

    if (response.data?.status === 200 && response.data?.data) {
      const allCosmetics = response.data.data.br;
      if (!Array.isArray(allCosmetics)) return [];

      glidersCache[cacheKey] = allCosmetics
        .filter((item: any) => item.type?.value === 'glider')
        .map((item: any) => ({
          name: item.name,
          id: item.id,
          rarity: item.rarity?.displayValue || 'Común',
          set: item.set?.text || null,
        }))
        .filter((g: Glider) => g.id && g.name)
        .sort((a: Glider, b: Glider) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + 30 * 60 * 1000;
      return glidersCache[cacheKey];
    }
    return [];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP GLIDER] Error obteniendo gliders:', error.message);
    return [];
  }
}

export async function handleGliderAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'glider' && focusedOption.name !== 'alas') return;

    const gliders = await getGliders(apiLang);
    if (!gliders.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.glider.errors.apiLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focusedOption.value.toLowerCase();
    const filtered = query
      ? gliders.filter(
          (glider) =>
            glider.name.toLowerCase().includes(query) ||
            glider.id.toLowerCase().includes(query),
        )
      : gliders;

    await interaction.respond(
      filtered.slice(0, 25).map((glider) => ({
        name: `${glider.name} (${glider.rarity})`,
        value: glider.id,
      })),
    );
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP GLIDER] Error en autocompletado:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.glider.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleGlider(interaction: ChatInputCommandInteraction): Promise<void> {
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
    const gliderId = interaction.options.getString('glider', true);

    if (gliderId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.glider.errors.apiLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const gliders = await getGliders(apiLang);
    const selectedGlider = gliders.find((glider) => glider.id === gliderId);
    const gliderName = selectedGlider?.name || gliderId;

    const variantDetail = await fetchCosmeticVariantDetail(gliderId, apiLang);
    const variantPayload = await pickVariantSelections(interaction, userId, variantDetail);
    if (!variantPayload) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.variants.errors.timeout', undefined, interaction.locale),
        author,
      });
      return;
    }

    await callCore('ghostequip.glider', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      itemId: gliderId,
      athenaVariants: variantPayload.athenaVariants,
      mpIndices: variantPayload.mpIndices,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.glider.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.glider.success.description', { gliderName }, interaction.locale),
      image: cosmeticIconUrl(gliderId, variantPayload.previewImage),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP GLIDER] Error:', error);

    if (error.message === 'noCuenta' || error.message === 'noMain') {
      await replyEpicCredentialError(interaction, userId, error.message);
      return;
    }

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
