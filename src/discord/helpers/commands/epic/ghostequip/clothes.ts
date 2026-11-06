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

interface Cloth {
  name: string;
  id: string;
  rarity: string;
  set: string | null;
}

let clothesCache: Record<string, Cloth[]> = {};
let cacheExpiry: Record<string, number> = {};

async function getClothes(userLocale: string = 'en'): Promise<Cloth[]> {
  const cacheKey = userLocale;

  if (clothesCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return clothesCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics', {
      params: { language: userLocale },
      timeout: 10000,
    });

    if (response.data?.status === 200 && response.data?.data) {
      const allCosmetics = response.data.data.br;
      if (!Array.isArray(allCosmetics)) return [];

      clothesCache[cacheKey] = allCosmetics
        .filter((item: any) => item.type?.value === 'shoe')
        .map((item: any) => ({
          name: item.name,
          id: item.id,
          rarity: item.rarity?.displayValue || 'Común',
          set: item.set?.text || null,
        }))
        .filter((cloth: Cloth) => cloth.id && cloth.name)
        .sort((a: Cloth, b: Cloth) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + 30 * 60 * 1000;
      return clothesCache[cacheKey];
    }
    return [];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP CLOTHES] Error obteniendo zapatos:', error.message);
    return [];
  }
}

export async function handleClothesAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'zapatos' && focusedOption.name !== 'shoes') return;

    const clothes = await getClothes(apiLang);
    if (!clothes.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.clothes.errors.autocompleteLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focusedOption.value.toLowerCase();
    let filtered = clothes;

    if (query.length > 0) {
      filtered = clothes.filter(
        (cloth) =>
          cloth.name.toLowerCase().includes(query) ||
          cloth.id.toLowerCase().includes(query),
      );
    }

    if (filtered.length === 0 && query.length > 0) {
      filtered = clothes.slice(0, 25);
    }

    await interaction.respond(
      filtered.slice(0, 25).map((cloth) => ({
        name: `${cloth.name} (${cloth.rarity})`,
        value: cloth.id,
      })),
    );
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP CLOTHES] Error en autocompletado:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.clothes.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleClothes(interaction: ChatInputCommandInteraction): Promise<void> {
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
    const clothId = interaction.options.getString('zapatos', true);

    if (clothId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.clothes.errors.apiLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const clothes = await getClothes(apiLang);
    const selectedCloth = clothes.find((cloth) => cloth.id === clothId);
    const clothName = selectedCloth?.name || clothId;

    const variantDetail = await fetchCosmeticVariantDetail(clothId, apiLang);
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

    await callCore('ghostequip.shoes', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      itemId: clothId,
      athenaVariants: variantPayload.athenaVariants,
      mpIndices: variantPayload.mpIndices,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.clothes.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.clothes.success.description', { clothName }, interaction.locale),
      image: cosmeticIconUrl(clothId, variantPayload.previewImage),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP CLOTHES] Error:', error);

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
