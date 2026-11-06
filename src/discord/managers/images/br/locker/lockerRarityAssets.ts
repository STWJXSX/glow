import fs from 'fs';

import path from 'path';

import sharp from 'sharp';

import type { LockerPageScratch } from './types.ts';

import { buildLockerTileBgSvg } from './lockerRarityTheme.ts';



const ASSETS_DIR = path.join((import.meta.dirname ?? __dirname), 'assets', 'rarity');



/** Fortnite wiki locker rarity textures (game-accurate). */

export const LOCKER_RARITY_ASSET_FILES: Record<string, string> = {

  common: 'common.png',

  uncommon: 'uncommon.png',

  rare: 'rare.png',

  epic: 'epic.png',

  legendary: 'legendary.png',

  mythic: 'mythic.png',

  exclusive: 'mythic.png',

  marvel: 'marvel.png',

  dark: 'dark.png',

  dc: 'dc.png',

  icon: 'icon.png',

  frozen: 'frozen.png',

  lava: 'lava.png',

  shadow: 'shadow.png',

  starwars: 'starwars.png',

  slurp: 'slurp.png',

  gaminglegends: 'gaminglegends.png',

};



export function resolveRarityAssetPath(themeKey: string): string | null {

  const file = LOCKER_RARITY_ASSET_FILES[themeKey];

  if (!file) return null;

  const full = path.join(ASSETS_DIR, file);

  return fs.existsSync(full) ? full : null;

}



export async function loadLockerTileBackground(

  themeKey: string,

  size: number,

  scratch: LockerPageScratch,

): Promise<Buffer> {

  const key = `${themeKey}|${size}`;

  const hit = scratch.backgrounds.get(key);

  if (hit) return hit;



  const assetPath = resolveRarityAssetPath(themeKey);

  let buf: Buffer;

  if (assetPath) {

    buf = await sharp(assetPath)

      .resize(size, size, { fit: 'fill' })

      .png({ compressionLevel: 3 })

      .toBuffer();

  } else {

    buf = await sharp(Buffer.from(buildLockerTileBgSvg(size, themeKey)))

      .png({ compressionLevel: 3 })

      .toBuffer();

  }



  scratch.backgrounds.set(key, buf);

  return buf;

}


