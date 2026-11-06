import { CLIENT_SETTINGS_PLATFORM_ALL } from '#helpers/epic/fortnite/clientSettingsPlatforms.ts';
import type { PlatformTransferResult } from '#helpers/epic/fortnite/clientSettingsCloud.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { platformLabel } from './cloudconfigPlatforms.ts';

export async function formatTransferResultLines(
  userId: string,
  results: PlatformTransferResult[],
  locale: string | null | undefined,
): Promise<string> {
  const lines: string[] = [];
  for (const r of results) {
    const label = platformLabel(r.platformId);
    if (r.ok) {
      const line = await translateForUser(
        userId,
        'cloudconfig.results.okLine',
        { platform: label, bytes: String(r.bytes) },
        locale,
      );
      lines.push(line);
    } else if (r.reason === 'missing') {
      const line = await translateForUser(
        userId,
        'cloudconfig.results.missing',
        { platform: label },
        locale,
      );
      lines.push(line);
    } else {
      const line = await translateForUser(
        userId,
        'cloudconfig.results.error',
        { platform: label, message: r.message ?? '—' },
        locale,
      );
      lines.push(line);
    }
  }
  return lines.join('\n');
}

export function normalizePlatformSelection(values: string[]): string[] {
  if (values.includes(CLIENT_SETTINGS_PLATFORM_ALL)) {
    return [CLIENT_SETTINGS_PLATFORM_ALL];
  }
  return [...new Set(values)];
}
