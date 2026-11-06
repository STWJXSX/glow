import { parseAccountResourceTiles } from '../resources/resourcesParser.ts';
import { resolveImageDisplayName } from '../stwImageBranding.ts';
import { renderAmoledPanel } from '../amoledPanel/amoledPanelRender.ts';
import type { AmoledGridTile } from '../amoledPanel/types.ts';
import type { StwResourceTile } from '../resources/types.ts';

export const STW_RESOURCES_ONLY_FILE_NAME = 'stw-resources-only';

export interface GenerateStwResourcesOnlyImageOptions {
  campaignProfile: Record<string, unknown>;
  displayName?: string;
  accessToken?: string;
  accountId?: string;
  discordUserId?: string;
  metaLine?: string;
  branding?: import('../stwImageBranding.ts').StwImageBrandingOptions;
}

function profileItems(profile: Record<string, unknown>): Record<string, { templateId?: string; quantity?: number }> {
  const items = profile.items;
  return items && typeof items === 'object' ? items as Record<string, { templateId?: string; quantity?: number }> : {};
}

function toGridTiles(resources: StwResourceTile[]): AmoledGridTile[] {
  return resources.map((r) => ({
    iconPath: r.iconPath,
    quantity: r.quantity,
  }));
}

export async function generateStwResourcesOnlyImage(
  options: GenerateStwResourcesOnlyImageOptions,
) {
  const items = profileItems(options.campaignProfile);
  const resources = parseAccountResourceTiles(items as Parameters<typeof parseAccountResourceTiles>[0]);
  if (!resources.length) throw new Error('No displayable STW resources');

  const title = options.displayName
    ? resolveImageDisplayName(options.displayName, options.branding)
    : 'STW Resources';

  return renderAmoledPanel({
    title,
    tiles: toGridTiles(resources),
    accessToken: options.accessToken,
    accountId: options.accountId,
    discordUserId: options.discordUserId,
    branding: options.branding,
    fileBaseName: STW_RESOURCES_ONLY_FILE_NAME,
  });
}
