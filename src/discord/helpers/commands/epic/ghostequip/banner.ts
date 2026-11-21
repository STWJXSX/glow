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

interface Banner {
  name: string;
  id: string;
  devName: string;
  category: string;
}

let bannersCache: Record<string, Banner[]> = {};
let cacheExpiry: Record<string, number> = {};

async function getBanners(userLocale: string = 'en'): Promise<Banner[]> {
  const cacheKey = userLocale;

  if (bannersCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return bannersCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v1/banners', {
      params: { language: userLocale },
      timeout: 10000,
    });

    if (response.data?.status === 200 && response.data?.data) {
      const allBanners = response.data.data;
      if (!Array.isArray(allBanners)) return [];

      bannersCache[cacheKey] = allBanners
        .map((item: any) => ({
          name: item.devName ?? 'Banner',
          id: item.id,
          devName: item.devName || item.id,
          category: item.category || 'Sin categoría',
        }))
        .filter((banner: Banner) => banner.id && banner.name)
        .sort((a: Banner, b: Banner) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + 30 * 60 * 1000;
      return bannersCache[cacheKey];
    }
    return [];
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP BANNER] Error obteniendo banners:', error.message);
    return [];
  }
}

export async function handleBannerAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'banner') return;

    const banners = await getBanners(apiLang);
    if (!banners.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.banner.errors.autocompleteLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focusedOption.value.toLowerCase();
    let filtered = banners;

    if (query.length > 0) {
      filtered = banners.filter(
        (banner) =>
          banner.name.toLowerCase().includes(query) ||
          banner.id.toLowerCase().includes(query),
      );
    }

    if (filtered.length === 0 && query.length > 0) {
      filtered = banners.slice(0, 25);
    }

    await interaction.respond(
      filtered.slice(0, 25).map((banner) => ({
        name: `${banner.name} (${banner.category})`,
        value: banner.id,
      })),
    );
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP BANNER] Error en autocompletado:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.banner.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleBanner(interaction: ChatInputCommandInteraction): Promise<void> {
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
    const bannerId = interaction.options.getString('banner', true);

    if (bannerId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.banner.errors.apiLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const banners = await getBanners(apiLang);
    const selectedBanner = banners.find((banner) => banner.id === bannerId);
    const bannerName = selectedBanner?.name || bannerId;

    await callCore('ghostequip.banner', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      bannerId,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.banner.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.banner.success.description', { bannerName }, interaction.locale),
      image: `https://fortnite-api.com/images/banners/${bannerId}/icon.png`,
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP BANNER] Error:', error);

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
