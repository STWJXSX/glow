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

interface Outfit {
  name: string;
  id: string;
  rarity: string;
  set: string | null;
}

let skinsCache: Record<string, Outfit[]> = {};
let cacheExpiry: Record<string, number> = {};

async function getOutfits(userLocale: string = 'en'): Promise<Outfit[]> {
  const cacheKey = userLocale;

  if (skinsCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return skinsCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics', {
      params: { language: userLocale },
      timeout: 10000,
    });

    if (response.data?.status === 200 && response.data?.data) {
      const outfits = response.data.data.br;
      if (!Array.isArray(outfits)) return [];

      skinsCache[cacheKey] = outfits
        .filter((item: any) => item.type?.value === 'outfit')
        .map((item: any) => ({
          name: item.name,
          id: item.id,
          rarity: item.rarity?.displayValue || 'Común',
          set: item.set?.text || null,
        }))
        .filter((outfit: Outfit) => outfit.id && outfit.name)
        .sort((a: Outfit, b: Outfit) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + (30 * 60 * 1000);
      return skinsCache[cacheKey];
    }
    return [];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP OUTFIT] Error obteniendo skins:', error.message);
    return [];
  }
}

export async function handleOutfitAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    const apiLang = await getFortniteApiLanguageCode(interaction.user.id, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'skin') {
      const outfits = await getOutfits(apiLang);

      if (!outfits || outfits.length === 0) {
        await interaction.respond([{
          name: await translateForUser(interaction.user.id, 'ghostequip.outfit.errors.autocompleteLoad', undefined, interaction.locale),
          value: 'error',
        }]);
        return;
      }

      const filtered = outfits
        .filter((outfit) => outfit.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .slice(0, 25)
        .map((outfit) => ({
          name: `${outfit.name} (${outfit.rarity})`,
          value: outfit.id,
        }));

      await interaction.respond(filtered);
    }
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP OUTFIT] Error en autocompletado:', error);
    await interaction.respond([{
      name: await translateForUser(interaction.user.id, 'ghostequip.outfit.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleOutfit(interaction: ChatInputCommandInteraction): Promise<void> {
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
    const outfitId = interaction.options.getString('skin', true);

    if (outfitId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.outfit.errors.apiLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const outfits = await getOutfits(apiLang);
    const selectedOutfit = outfits.find((outfit) => outfit.id === outfitId);
    const outfitName = selectedOutfit?.name || outfitId;

    const variantDetail = await fetchCosmeticVariantDetail(outfitId, apiLang);
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

    await callCore('ghostequip.outfit', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      itemId: outfitId,
      athenaVariants: variantPayload.athenaVariants,
      mpIndices: variantPayload.mpIndices,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.outfit.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.outfit.success.description', { outfitName }, interaction.locale),
      image: cosmeticIconUrl(outfitId, variantPayload.previewImage),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP OUTFIT] Error en el proceso');

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
