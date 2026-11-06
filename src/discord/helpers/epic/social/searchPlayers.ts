import axios from 'axios';
import { AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import UsuarioInfo, { type IDeviceAuth } from '#models/UsuarioInfo.ts';
import { refreshDeviceAuthJson, refreshMainAccountToken } from '../auth/tokenRefresh.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { join } from 'path';

export interface SearchPlayersAutocompleteOptions {
  /** Use the invoking user's linked main Epic account (no bot deviceAuth.json). */
  requireUserMain?: boolean;
  /** Locale keys prefix for autocomplete error values (default: stalk.errors). */
  errorKeyPrefix?: string;
}

const EPIC_CLIENT_HEADER = "M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=";

/**
 * Estructura de un resultado de búsqueda de jugador
 */
export interface PlayerSearchResult {
  accountId: string;
  displayName: string;
  platform?: string;
}



/**
 * Busca jugadores por prefijo usando User Search Service
 */
export async function searchPlayersByPrefix(
  accessToken: string,
  searchTerm: string,
  accountId: string,
  platform: string = 'epic'
): Promise<PlayerSearchResult[]> {
  try {
    const response = await axios.get(
      `https://user-search-service-prod.ol.epicgames.com/api/v1/search/${accountId}`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          platform: platform,
          prefix: searchTerm
        },
        timeout: 5000
      }
    );
    
    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }
    
    const results: PlayerSearchResult[] = [];
    for (const result of response.data) {
      if (result.accountId && result.matches && Array.isArray(result.matches)) {
        for (const match of result.matches) {
          if (match.value && match.platform) {
            results.push({
              accountId: result.accountId,
              displayName: match.value,
              platform: match.platform
            });
          }
        }
      }
    }
    
    return results;
  } catch (error: any) {
    if (error.response?.status === 404 || error.response?.status === 403) {
      return [];
    }
    log.epic.debug({ error: error.response?.status }, 'Error en búsqueda por prefijo');
    return [];
  }
}

/**
 * Busca jugadores por displayName exacto usando endpoint público
 */
export async function searchPlayersByDisplayName(
  accessToken: string,
  searchTerm: string
): Promise<PlayerSearchResult[]> {
  try {
    const response = await axios.get(
      `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/${encodeURIComponent(searchTerm)}`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 3000
      }
    );
    
    if (response.data && response.data.id && response.data.displayName) {
      return [{
        accountId: response.data.id,
        displayName: response.data.displayName,
        platform: 'epic'
      }];
    }
    
    return [];
  } catch (error: any) {
    if (error.response?.status === 404) {
      return [];
    }
    log.epic.debug({ error: error.response?.status }, 'Error en búsqueda por displayName');
    return [];
  }
}

/**
 * Busca jugadores por múltiples IDs
 */
export async function searchPlayersByIds(
  accessToken: string,
  accountIds: string[]
): Promise<PlayerSearchResult[]> {
  try {
    if (!accountIds || accountIds.length === 0) {
      return [];
    }

    const limitedIds = accountIds.slice(0, 100);
    
    const response = await axios.get(
      'https://account-public-service-prod.ol.epicgames.com/account/api/public/account',
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          accountId: limitedIds
        },
        timeout: 5000
      }
    );
    
    if (!Array.isArray(response.data)) {
      return [];
    }
    
    return response.data.map((account: any) => ({
      accountId: account.id,
      displayName: account.displayName,
      platform: 'epic'
    }));
  } catch (error: any) {
    log.epic.error({ error: error.response?.status }, 'Error en búsqueda por IDs');
    return [];
  }
}

/**
 * Función reutilizable para autocompletar nombres de jugadores
 * Usa deviceAuth.json para las búsquedas (más ligero y eficiente)
 */
async function autocompleteErrorLabel(
  interaction: AutocompleteInteraction,
  key: string,
  fallback: string,
  prefix = 'stalk.errors',
): Promise<string> {
  try {
    const msg = await translateForUser(interaction.user.id, `${prefix}.${key}`, undefined, interaction.locale);
    return msg.slice(0, 100);
  } catch {
    return fallback.slice(0, 100);
  }
}

export async function searchPlayersAutocomplete(
  interaction: AutocompleteInteraction,
  optionName: string = 'displayname',
  maxResults: number = 25,
  options: SearchPlayersAutocompleteOptions = {},
): Promise<void> {
  try {
    const focusedValue = interaction.options.getFocused() as string;
    const errorPrefix = options.errorKeyPrefix ?? 'stalk.errors';

    if (!focusedValue || focusedValue.length < 2) {
      await interaction.respond([]);
      return;
    }

    let deviceAuthAccount: IDeviceAuth | null = null;

    if (options.requireUserMain) {
      const { mainAccount, error } = await refreshMainAccountToken(interaction.user.id);
      if (!mainAccount?.accessToken) {
        const key = error === 'no_main' || error === 'no_accounts' ? 'no_account' : 'invalid_token';
        await interaction.respond([{
          name: await autocompleteErrorLabel(interaction, key, 'Link your Epic account first.', errorPrefix),
          value: key,
        }]);
        return;
      }
      deviceAuthAccount = mainAccount;
    } else {
      deviceAuthAccount = await refreshDeviceAuthJson();
      if (!deviceAuthAccount?.accessToken) {
        await interaction.respond([{
          name: await autocompleteErrorLabel(interaction, 'bot_auth_error', 'Bot authentication failed.', errorPrefix),
          value: 'bot_auth_error',
        }]);
        return;
      }
    }
    
    const foundPlayers = new Map<string, { name: string; value: string; sortPosition: number }>();
    const platforms = ['epic', 'psn', 'xbl', 'steam', 'nsw'];
    
    // ESTRATEGIA 1: User Search Service en todas las plataformas
    let userSearchFailed = false;
    for (const platform of platforms) {
      if (foundPlayers.size >= maxResults) break;
      
      try {
        const results = await searchPlayersByPrefix(
          deviceAuthAccount.accessToken,
          focusedValue,
          deviceAuthAccount.accountId,
          platform
        );
        
        for (const player of results) {
          if (!foundPlayers.has(player.accountId)) {
            const platformDisplay = {
              'epic': 'Epic',
              'psn': 'PSN',
              'xbl': 'Xbox',
              'steam': 'Steam',
              'nsw': 'Switch'
            }[player.platform || platform] || platform.toUpperCase();
            
            foundPlayers.set(player.accountId, {
              name: `${player.displayName} (${platformDisplay})`,
              value: player.accountId,
              sortPosition: 0
            });
          }
          
          if (foundPlayers.size >= maxResults) break;
        }
        
        // Pequeña pausa entre plataformas para evitar rate limit
        if (foundPlayers.size < maxResults && platforms.indexOf(platform) < platforms.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error: any) {
        if (error.response?.status === 403) {
          userSearchFailed = true;
          log.epic.info('User Search Service no disponible (403), usando fallback');
          break;
        }
        // Continuar con siguiente plataforma
        continue;
      }
    }
    
    // ESTRATEGIA 2: Búsqueda exacta pública si no hay resultados o falló
    if (userSearchFailed || foundPlayers.size === 0) {
      try {
        log.epic.info({ searchTerm: focusedValue }, 'Usando búsqueda exacta pública');
        const results = await searchPlayersByDisplayName(
          deviceAuthAccount.accessToken,
          focusedValue
        );
        
        for (const player of results) {
          if (!foundPlayers.has(player.accountId)) {
            foundPlayers.set(player.accountId, {
              name: `${player.displayName} (Epic - Exact)`,
              value: player.accountId,
              sortPosition: 0
            });
          }
        }
      } catch (error) {
        log.epic.debug({ error }, 'Error en búsqueda pública');
      }
    }
    
    // ESTRATEGIA 3: Buscar en DB local si aún no hay resultados (solo modo bot)
    if (!options.requireUserMain && foundPlayers.size === 0) {
      try {
        const dbResults = await UsuarioInfo.find({
          $or: [
            { displayName: { $regex: focusedValue, $options: 'i' } },
            { displayName: { $regex: `^${focusedValue}`, $options: 'i' } }
          ]
        }).limit(10).lean();
        
        for (const user of dbResults as any[]) {
          if (user.accountId && user.displayName && !foundPlayers.has(user.accountId)) {
            foundPlayers.set(user.accountId, {
              name: `${user.displayName} (DB Local)`,
              value: user.accountId,
              sortPosition: 0
            });
          }
        }
      } catch (error) {
        // DB no disponible, continuar
      }
    }
    
    // Ordenar y formatear resultados
    const choices = Array.from(foundPlayers.values())
      .sort((a, b) => a.sortPosition - b.sortPosition)
      .slice(0, maxResults);
    
    if (choices.length === 0) {
      const noResultsKey = userSearchFailed ? 'no_search_permissions' : 'no_results';
      const fallback = userSearchFailed
        ? `No search permissions. Try exact name: "${focusedValue}"`
        : `No results for "${focusedValue}"`;
      await interaction.respond([{
        name: await autocompleteErrorLabel(interaction, noResultsKey, fallback, errorPrefix),
        value: userSearchFailed ? 'no_search_permissions' : 'no_results',
      }]);
      return;
    }
    
    await interaction.respond(choices);
    
  } catch (error: any) {
    log.epic.error({ error }, 'Error en autocomplete de jugadores');
    
    // Mensajes de error específicos
    let errorMessage = 'Error searching players';
    let errorValue = 'search_error';
    
    const errorPrefix = options.errorKeyPrefix ?? 'stalk.errors';
    if (error.response?.status === 401) {
      errorValue = options.requireUserMain ? 'token_expired' : 'bot_token_expired';
    } else if (error.response?.status === 403) {
      errorValue = 'no_search_permissions';
    } else if (error.response?.status === 429) {
      errorValue = 'rate_limited';
    }

    errorMessage = await autocompleteErrorLabel(interaction, errorValue, errorMessage, errorPrefix);

    await interaction.respond([{
      name: errorMessage,
      value: errorValue,
    }]).catch(() => {});
  }
}
