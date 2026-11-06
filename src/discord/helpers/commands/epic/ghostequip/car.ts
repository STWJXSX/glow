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

interface CarBody {
  name: string;
  id: string;
  rarity: string;
}

let carsCache: Record<string, CarBody[]> = {};
let cacheExpiry: Record<string, number> = {};

/** Fortnite party meta uses `CarBody_*`; fortnite-api cars use `Body_*`. */
export function toPartyCarBodyId(apiCarId: string): string {
  if (/^CarBody_/i.test(apiCarId)) return apiCarId;
  if (/^Body_/i.test(apiCarId)) return apiCarId.replace(/^Body_/i, 'CarBody_');
  return `CarBody_${apiCarId}`;
}

async function getCarBodies(userLocale: string = 'en'): Promise<CarBody[]> {
  const cacheKey = userLocale;

  if (carsCache[cacheKey] && Date.now() < (cacheExpiry[cacheKey] || 0)) {
    return carsCache[cacheKey];
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics/cars', {
      params: { language: userLocale },
      timeout: 15_000,
    });

    if (response.data?.status === 200 && Array.isArray(response.data?.data)) {
      carsCache[cacheKey] = response.data.data
        .filter((item: { type?: { value?: string } }) => item.type?.value === 'body')
        .map((item: { name?: string; id?: string; rarity?: { displayValue?: string } }) => ({
          name: item.name ?? item.id ?? '',
          id: item.id ?? '',
          rarity: item.rarity?.displayValue || 'Common',
        }))
        .filter((car: CarBody) => car.id && car.name)
        .sort((a: CarBody, b: CarBody) => a.name.localeCompare(b.name));

      cacheExpiry[cacheKey] = Date.now() + 30 * 60 * 1000;
      return carsCache[cacheKey];
    }
    return [];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.epic.error('[GHOST EQUIP CAR] Error loading cars:', message);
    return [];
  }
}

export async function handleCarAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'coche' && focusedOption.name !== 'car') return;

    const cars = await getCarBodies(apiLang);
    if (!cars.length) {
      await interaction.respond([{
        name: await translateForUser(userId, 'ghostequip.car.errors.autocompleteLoad', undefined, interaction.locale),
        value: 'error',
      }]);
      return;
    }

    const query = focusedOption.value.toLowerCase();
    const filtered = query
      ? cars.filter(
          (car) =>
            car.name.toLowerCase().includes(query) ||
            car.id.toLowerCase().includes(query),
        )
      : cars;

    await interaction.respond(
      filtered.slice(0, 25).map((car) => ({
        name: `${car.name} (${car.rarity})`,
        value: car.id,
      })),
    );
  } catch (error: unknown) {
    log.epic.error('[GHOST EQUIP CAR] Autocomplete error:', error);
    await interaction.respond([{
      name: await translateForUser(userId, 'ghostequip.car.errors.autocompleteError', undefined, interaction.locale),
      value: 'error',
    }]);
  }
}

export async function handleCar(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const carApiId = interaction.options.getString('coche', true);

    if (carApiId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.selectionError.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.car.errors.apiLoad', undefined, interaction.locale),
      });
      return;
    }

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const cars = await getCarBodies(apiLang);
    const selected = cars.find((car) => car.id === carApiId);
    const carName = selected?.name || carApiId;
    const partyBodyId = toPartyCarBodyId(carApiId);

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

    await callCore('ghostequip.car', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      bodyId: partyBodyId,
    });

    const author = await getEpicAuthor(userId);
    const imageSlug = carApiId.replace(/^Body_/i, 'body_').toLowerCase();
    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.car.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(
        userId,
        'ghostequip.car.success.description',
        { carName },
        interaction.locale,
      ),
      image: `https://fortnite-api.com/images/cosmetics/cars/${imageSlug}/small.png`,
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP CAR] Error:', error);

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

    if (error.message === 'Party permission error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.noPermissions.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.common.errors.noPermissions.description', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
