import type { StwImageBrandingOptions } from '../stwImageBranding.ts';

export interface AmoledGridTile {
  iconPath: string | null;
  quantity: number;
}

export interface RenderAmoledPanelPage {
  buffer: Buffer;
  fileName: string;
  itemCount: number;
}

export interface RenderAmoledPanelOptions {
  title: string;
  metaLine?: string;
  tiles: AmoledGridTile[];
  gridCols?: number;
  gridRows?: number;
  maxPages?: number;
  branding?: StwImageBrandingOptions;
  accessToken?: string;
  accountId?: string;
  discordUserId?: string;
  fileBaseName: string;
}

export interface RenderAmoledPanelResult {
  pages: RenderAmoledPanelPage[];
  totalCount: number;
  truncated: boolean;
}
