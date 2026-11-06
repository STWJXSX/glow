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

interface Backpack {
  name: string;
  id: string;
  rarity: string;
  set: string | null;
}

let backpacksCache: Record<string, Backpack[]> = {};
let cacheExpiry: Record<string, number> = {};

async function getBackpacks(userLocale: string = 'en'): Promise<Backpack[]> {
  const cacheKey = userLocale;

  if (backpacksCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return backpacksCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics', {
      params: { language: userLocale },
      timeout: 10000,
    });

    if (response.data?.status === 200 && response.data?.data) {
      const allCosmetics = response.data.data.br;
      if (!Array.isArray(allCosmetics)) return [];

      backpacksCache[cacheKey] = allCosmetics
        .filter((item: any) => item.type?.value === 'backpack')
        .map((item: any) => ({
          name: item.name,
          id: item.id,
          rarity: item.rarity?.displayValue || 'Común',
          set: item.set?.text || null,
        }))
        .filter((backpack: Backpack) => backpack.id && backpack.name)
        .sort((a: Backpack, b: Backpack) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + 30 * 60 * 1000;
      return backpacksCache[cacheKey];
    }
    return [];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP BACKPACK] Error obteniendo mochilas:', error.message);
    return [];
  }
}

export async function handleBackpackAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'mochila' && focusedOption.name !== 'backpack') return;

    const backpacks = await getBackpacks(apiLang);
    if (!backpacks.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.backpack.errors.autocompleteLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focusedOption.value.toLowerCase();
    let filtered = backpacks;

    if (query.length > 0) {
      filtered = backpacks.filter(
        (backpack) =>
          backpack.name.toLowerCase().includes(query) ||
          backpack.id.toLowerCase().includes(query),
      );
    }

    if (filtered.length === 0 && query.length > 0) {
      filtered = backpacks.slice(0, 25);
    }

    await interaction.respond(
      filtered.slice(0, 25).map((backpack) => ({
        name: `${backpack.name} (${backpack.rarity})`,
        value: backpack.id,
      })),
    );
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP BACKPACK] Error en autocompletado:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.backpack.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleBackpack(interaction: ChatInputCommandInteraction): Promise<void> {
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
    const backpackId = interaction.options.getString('mochila', true);

    if (backpackId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.backpack.errors.apiLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const backpacks = await getBackpacks(apiLang);
    const selectedBackpack = backpacks.find((backpack) => backpack.id === backpackId);
    const backpackName = selectedBackpack?.name || backpackId;

    const variantDetail = await fetchCosmeticVariantDetail(backpackId, apiLang);
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

    await callCore('ghostequip.backpack', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      itemId: backpackId,
      athenaVariants: variantPayload.athenaVariants,
      mpIndices: variantPayload.mpIndices,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.backpack.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.backpack.success.description', { backpackName }, interaction.locale),
      image: cosmeticIconUrl(backpackId, variantPayload.previewImage),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP BACKPACK] Error:', error);

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
