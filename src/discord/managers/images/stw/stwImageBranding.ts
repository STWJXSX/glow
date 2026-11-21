import { maskDisplayName } from '#helpers/epic/account/avatarHandler.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';

export const STW_DEFAULT_SITE_LABEL = 'glowhaven.site';
export const STW_DISCORD_INVITE_PATH = 'glowhaven.site/discord';

export interface StwImageBrandingOptions {
  siteUrl?: string;
  footerIconUrl?: string;
  maskDisplayName?: boolean;
  lang?: SupportedLanguage;
}

export function resolveStwSiteLabel(customLink?: string | null): string {
  const raw = customLink?.trim();
  if (!raw) return STW_DEFAULT_SITE_LABEL;
  return raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

/** US English date for image footers (M/D/YYYY). */
export function formatStwImageDate(date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

/** US English date-time for card headers (M/D/YYYY, h:mm:ss AM). */
export function formatStwMetaDateTime(date = new Date()): string {
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function resolveImageDisplayName(
  displayName: string,
  options?: StwImageBrandingOptions,
): string {
  if (!options?.maskDisplayName) return displayName;
  return maskDisplayName(displayName);
}
