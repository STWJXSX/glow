import { renderAmoledPanel } from '../amoledPanel/amoledPanelRender.ts';
import { resolveImageDisplayName } from '../stwImageBranding.ts';
import { resolveLlamaIconPath } from './llamasAssetResolver.ts';
import { parseStwLlamaTiles } from './llamasParser.ts';

export const STW_LLAMAS_FILE_NAME = 'stw-llamas';

export interface GenerateStwLlamasImageOptions {
  campaignProfile: Record<string, unknown>;
  displayName?: string;
  accessToken?: string;
  accountId?: string;
  discordUserId?: string;
  metaLine?: string;
  branding?: import('../stwImageBranding.ts').StwImageBrandingOptions;
}

export async function generateStwLlamasImage(options: GenerateStwLlamasImageOptions) {
  const llamas = parseStwLlamaTiles(options.campaignProfile);
  if (!llamas.length) throw new Error('No STW llamas');

  const title = options.displayName
    ? resolveImageDisplayName(options.displayName, options.branding)
    : 'STW Llamas';

  return renderAmoledPanel({
    title,
    metaLine: options.metaLine ?? '',
    tiles: llamas.map((l) => ({
      iconPath: resolveLlamaIconPath(l.templateId),
      quantity: l.quantity,
    })),
    gridCols: 8,
    gridRows: 5,
    accessToken: options.accessToken,
    accountId: options.accountId,
    discordUserId: options.discordUserId,
    branding: options.branding,
    fileBaseName: STW_LLAMAS_FILE_NAME,
  });
}
