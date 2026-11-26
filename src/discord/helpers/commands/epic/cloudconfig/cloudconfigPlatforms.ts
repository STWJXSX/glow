import type { AutocompleteInteraction } from 'discord.js';
import {
  CLIENT_SETTINGS_PLATFORM_ALL,
  CLIENT_SETTINGS_PLATFORMS,
  getClientSettingsPlatform,
} from '#helpers/epic/fortnite/clientSettingsPlatforms.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { stripAutocompleteLabel } from '../epicEmbedHelper.ts';

const MAX = 25;

export function filterPlatformChoices(query: string): Array<{ id: string; label: string }> {
  const q = query.toLowerCase().trim();
  const all = CLIENT_SETTINGS_PLATFORMS.map((p) => ({ id: p.id, label: p.label }));
  const filtered = q
    ? all.filter((p) => p.id.includes(q) || p.label.toLowerCase().includes(q))
    : all;
  return filtered.slice(0, MAX - 1);
}

export async function respondPlatformAutocomplete(
  interaction: AutocompleteInteraction,
  focusedValue: string,
  includeAllOption: boolean,
): Promise<void> {
  const userId = interaction.user.id;
  const choices: Array<{ name: string; value: string }> = [];

  if (includeAllOption) {
    const allLabel = await translateForUser(
      userId,
      'cloudconfig.autocomplete.allPlatforms',
      undefined,
      interaction.locale,
    );
    const q = focusedValue.toLowerCase().trim();
    if (!q || 'all'.includes(q) || allLabel.toLowerCase().includes(q)) {
      choices.push({
        name: stripAutocompleteLabel(allLabel),
        value: CLIENT_SETTINGS_PLATFORM_ALL,
      });
    }
  }

  for (const p of filterPlatformChoices(focusedValue)) {
    choices.push({
      name: stripAutocompleteLabel(p.label),
      value: p.id,
    });
  }

  await interaction.respond(choices.slice(0, MAX));
}

export function resolvePlatformId(id: string | null): { ok: true; platform: ReturnType<typeof getClientSettingsPlatform> } | { ok: false } {
  if (!id || id === CLIENT_SETTINGS_PLATFORM_ALL) {
    return { ok: false };
  }
  const platform = getClientSettingsPlatform(id);
  if (!platform) return { ok: false };
  return { ok: true, platform };
}

export function platformLabel(platformId: string): string {
  if (platformId === CLIENT_SETTINGS_PLATFORM_ALL) return platformId;
  return getClientSettingsPlatform(platformId)?.label ?? platformId;
}
