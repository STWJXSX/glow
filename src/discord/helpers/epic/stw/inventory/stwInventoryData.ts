import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getStwItemTranslation, hasStwItemTranslation } from '../shop/stwShopTranslations.ts';
import { loadStwAssetCatalogs } from '../shop/stwShopAssets.ts';
import { hasStwInventoryGameIcon } from './stwInventoryAssets.ts';
import {
  normalizeIngredientCatalogId,
  resolveIngredientCatalogKey,
  resolveIngredientRarityFromCatalog,
  resolveWorldItemRarity,
} from './stwInventoryIngredientRarity.ts';
import { resolveStwRarity } from '../shop/stwShopCatalog.ts';
import { getStwPowerLevel } from '../gameplay/stwPowerLevel.ts';

export type StwInventorySource = 'campaign' | 'venture' | 'storage';

export const STW_INVENTORY_PROFILE: Record<StwInventorySource, string> = {
  campaign: 'theater0',
  venture: 'theater2',
  storage: 'outpost0',
};

export type StwInventoryCategory =
  | 'weapons'
  | 'traps'
  | 'materials'
  | 'ingredients'
  | 'ammo';

export type StwInventoryRarityCode = 'c' | 'uc' | 'r' | 'vr' | 'sr' | 'er' | 'ur';

const RAREZA_EMOJIS = {
  weapon: {
    c: '<:weapon_common:1400145933055768072>',
    uc: '<:weapon_uncommon:1400145935121869312>',
    r: '<:weapon_rare:1400145931944595599>',
    vr: '<:weapon_epic:1400145936541421598>',
    sr: '<:weapon_legendary:1400145934402326669>',
    default: '<:esquema:1364580858329174067>',
  },
  trap: {
    c: '<:trapd:1400149486030028891>',
    uc: '<:trapp:1400149454253981696>',
    r: '<:trapr:1400149451170910318>',
    vr: '<:trape:1400149456292413550>',
    sr: '<:trapl:1400149452525932601>',
    default: '<:trampa:1364581932469456916>',
  },
} as const;

const NOMBRE_EMOJIS: Record<string, string> = {
  'Cordel firme': '<:sturdy:1364575459345567784>',
  'Cordel paliducho': '<:stingy:1364575462420123648>',
  'Cordel esculpido': '<:esculpido:1364575456254230569>',
  'Cordel simple': '<:simple:1364575461035999353>',
  'Cordel fibroso': '<:peaky:1364575457776898078>',
  'Polvo de mineral oxidado': '<:oxidado:1364575951278837760>',
  'Polvo de mineral negro carbón': '<:polvonegrocarbon:1364575999223664650>',
  'Polvo de mineral fino': '<:polvofino:1364575489561198662>',
  'Polvo de mineral simple': '<:polvosimple:1364575976918487111>',
  'Polvo de mineral tosco': '<:tosco:1364575485958295642>',
  'Mena de plata': '<:menaplata:1364575813864919141>',
  'Mena de obsidiana': '<:obsidiana:1364575469344788592>',
  'Mena de malaquita': '<:malaquita:1364575470632304701>',
  'Mena de cobre': '<:menacobre:1364575475032260698>',
  'Mena de radiantita': '<:radiantita:1364575466228285500>',
  Carbón: '<:carbon:1364572472531353630>',
  'Mena en bruto': '<:menabruto:1408545968420552814>',
  Tablones: '<:tablones:1364572492064227410>',
  'Resina adhesiva': '<:resina:1408545796902621214>',
  'Turcas y tornillos': '<:tornillos:1408550769556328580>',
  'Piezas mecánicas lustrosas': '<:lustrosas:1364575478777774080>',
  'Piezas mecánicas eficientes': '<:eficiente:1364575842067419217>',
  'Piezas mecánicas firmes': '<:mecanicas:1364575902297620480>',
  'Piezas mecánicas simples': '<:piezamecanicasimple:1364575482120638464>',
  'Piezas mecánicas oxidadas': '<:mecanicas2bajas1:1364576249204179008>',
  'Hierbas fibrosas': '<:fibrosas:1364572489006714910>',
  'Pétalos de flores': '<:flores:1364572480450199592>',
  'Cristal de cuarzo': '<:cuarzo:1364580869582491659>',
  'Cristal de rayosol': '<:rayosol:1364575464793837640>',
  'Cristal de pizcasombra': '<:pizcasombra:1364575467457347624>',
  'Polvo explosivo': '<:explosivo:1364572476536918047>',
  Pilas: '<:pilas:1364572478185144340>',
  Beicon: '<:beicon:1364572474678710363>',
  'Cinta americana': '<:cinta:1364572481758822421>',
  Tornillos: '<:tornillos:1364572494324961401>',
  'Batería activa': '<:bateria:1364572484195717193>',
  'Chisme giratorio': '<:giratorio:1364572485823234109>',
  Madera: '<:madera:1408546325687042048>',
  Piedra: '<:piedra:1408546290236784640>',
  Metal: '<:metal:1408546246590730441>',
  'Sturdy Twine': '<:sturdy:1364575459345567784>',
  'Stringy Twine': '<:stingy:1364575462420123648>',
  'Carved Twine': '<:esculpido:1364575456254230569>',
  'Simple Twine': '<:simple:1364575461035999353>',
  'Peaky Twine': '<:peaky:1364575457776898078>',
  'Oxidized Mineral Powder': '<:oxidado:1364575951278837760>',
  'Char-black Mineral Powder': '<:polvonegrocarbon:1364575999223664650>',
  'Fine-grain Mineral Powder': '<:polvofino:1364575489561198662>',
  'Simple Mineral Powder': '<:polvosimple:1364575976918487111>',
  'Rough Mineral Powder': '<:tosco:1364575485958295642>',
  'Silver Ore': '<:menaplata:1364575813864919141>',
  'Obsidian Ore': '<:obsidiana:1364575469344788592>',
  'Malachite Ore': '<:malaquita:1364575470632304701>',
  'Copper Ore': '<:menacobre:1364575475032260698>',
  'Brightcore Ore': '<:radiantita:1364575466228285500>',
  Coal: '<:carbon:1364572472531353630>',
  'Rough Ore': '<:menabruto:1408545968420552814>',
  Planks: '<:tablones:1364572492064227410>',
  'Adhesive Resin': '<:resina:1408545796902621214>',
  "Nuts 'n' Bolts": '<:tornillos:1408550769556328580>',
  'Sleek Mechanical Parts': '<:lustrosas:1364575478777774080>',
  'Efficient Mechanical Parts': '<:eficiente:1364575842067419217>',
  'Sturdy Mechanical Parts': '<:mecanicas:1364575902297620480>',
  'Simple Mechanical Parts': '<:piezamecanicasimple:1364575482120638464>',
  'Rusty Mechanical Parts': '<:mecanicas2bajas1:1364576249204179008>',
  'Fibrous Herbs': '<:fibrosas:1364572489006714910>',
  'Flower Petals': '<:flores:1364572480450199592>',
  'Quartz Crystal': '<:cuarzo:1364580869582491659>',
  'Sunbeam Crystal': '<:rayosol:1364575464793837640>',
  'Shadowshard Crystal': '<:pizcasombra:1364575467457347624>',
  'Blast Powder': '<:explosivo:1364572476536918047>',
  Batteries: '<:pilas:1364572478185144340>',
  Bacon: '<:beicon:1364572474678710363>',
  'Duct Tape': '<:cinta:1364572481758822421>',
  Screws: '<:tornillos:1364572494324961401>',
  'Active Powercell': '<:bateria:1364572484195717193>',
  'Rotating Gizmo': '<:giratorio:1364572485823234109>',
  Wood: '<:madera:1408546325687042048>',
  Stone: '<:piedra:1408546290236784640>',
  metalitemdata: '<:metal:1408546246590730441>',
};

const ORDEN_RAREZA: Record<string, number> = { ur: 0, er: 0, sr: 1, vr: 2, r: 3, uc: 4, c: 5 };

/** Internal / non-loot templateId fragments (building pieces, badges, quest junk, etc.). */
const BLOCKED_TEMPLATE_SNIPPETS = [
  'buildingitemdata',
  'edittool',
  'questitem',
  'missionitem',
  'starlightkey',
  'starlightcoin',
  'starlight_badge',
  'defaultbackpack',
  'survivorextraction',
  'campaignbadge',
  'scorebonus',
  'criticalmission',
  'hordemode',
  'hordecombat',
  'hordebuilding',
  'hordeutility',
  'endlessutility',
  'utilityscore',
  'pts_',
  'etm_',
  'eac_',
  'winterquest',
  'gathercollect',
  'secondarymission',
  'permaniteitem',
  'phoenix_',
  'healingglobe',
];

export function isBlockedStwInventoryTemplateId(templateId: string): boolean {
  const raw = templateId.split(':')[1]?.toLowerCase() ?? '';
  if (!raw) return true;
  return BLOCKED_TEMPLATE_SNIPPETS.some((snippet) => raw.includes(snippet));
}

/** Item is shown in inventory list/image only with a real translation + game icon. */
export function isDisplayableStwInventoryItem(
  templateId: string,
  lang: SupportedLanguage,
  catalogs = loadStwAssetCatalogs(),
): boolean {
  if (isBlockedStwInventoryTemplateId(templateId)) return false;
  if (!hasStwItemTranslation(templateId, lang)) return false;
  if (!hasStwInventoryGameIcon(templateId, catalogs)) return false;
  return true;
}

const RARITY_COLORS: Record<string, string> = {
  c: '#9ca3af',
  uc: '#22c55e',
  r: '#3b82f6',
  vr: '#a855f7',
  sr: '#f59e0b',
  er: '#f59e0b',
  ur: '#f97316',
};

export interface StwInventoryItem {
  templateId: string;
  nombre: string;
  emojiMarkup: string;
  iconUrl: string | null;
  cantidad: number;
  stacks: number;
  nivel: number;
  rareza: StwInventoryRarityCode | null;
  categoria: StwInventoryCategory;
  prioridad: number;
}

export function discordEmojiToCdnUrl(markup: string): string | null {
  const m = markup.match(/<?a?:\w+:(\d+)>?/);
  if (!m?.[1]) return null;
  const animated = markup.startsWith('<a:');
  return `https://cdn.discordapp.com/emojis/${m[1]}.${animated ? 'gif' : 'png'}?size=64&quality=lossless`;
}

export function rarityAccentColor(rareza: StwInventoryRarityCode | null): string {
  if (!rareza) return '#6b7280';
  return RARITY_COLORS[rareza] ?? '#6b7280';
}

function extractRarity(templateId: string): StwInventoryRarityCode | null {
  const m = templateId.match(/_(vr|sr|er|ur|r|uc|c)(?:_|$)/i);
  return m ? (m[1].toLowerCase() as StwInventoryRarityCode) : null;
}

/**
 * Rarity for inventory — schematics use starting_rarity (mythic ≠ legendary template suffix).
 */
export function resolveStwInventoryItemRarity(
  templateId: string,
  startingRarity?: string | null,
): StwInventoryRarityCode | null {
  const [typeRaw] = templateId.split(':');
  const type = typeRaw.toLowerCase();

  if (type === 'weapon' || type === 'trap') {
    return resolveStwRarity(templateId, startingRarity);
  }

  const rawId = templateId.split(':')[1] ?? '';

  if (type === 'ingredient') {
    const fromCatalog = resolveIngredientRarityFromCatalog(normalizeIngredientCatalogId(rawId));
    return fromCatalog ?? 'c';
  }

  const fromPattern = extractRarity(templateId);
  if (fromPattern) return fromPattern;

  if (type === 'worlditem') {
    return resolveWorldItemRarity(rawId);
  }

  if (type === 'ammo') return 'c';

  return null;
}

function esTrampa(templateId: string, nombre: string): boolean {
  if (templateId.startsWith('Trap:')) return true;
  const n = nombre.toLowerCase();
  const hints = ['trampa', 'trap', 'ceiling', 'floor', 'wall', 'launcher', 'campfire', 'dynamo'];
  return hints.some((h) => n.includes(h));
}

function resolveInventoryPowerLevel(
  categoria: StwInventoryCategory,
  levelJuego: number,
  rareza: StwInventoryRarityCode | null,
): number {
  if (!(levelJuego > 0)) return 0;
  if (categoria === 'weapons' || categoria === 'traps') {
    return getStwPowerLevel(rareza ?? 'c', levelJuego);
  }
  return 0;
}

function emojiForItem(templateId: string, nombre: string): string {
  if (NOMBRE_EMOJIS[nombre]) return NOMBRE_EMOJIS[nombre];
  const rareza = resolveStwInventoryItemRarity(templateId);
  const trap = esTrampa(templateId, nombre);
  if (trap) {
    if (rareza && rareza in RAREZA_EMOJIS.trap) {
      return RAREZA_EMOJIS.trap[rareza as keyof typeof RAREZA_EMOJIS.trap];
    }
    return RAREZA_EMOJIS.trap.default;
  }
  if (rareza && rareza in RAREZA_EMOJIS.weapon) {
    return RAREZA_EMOJIS.weapon[rareza as keyof typeof RAREZA_EMOJIS.weapon];
  }
  return RAREZA_EMOJIS.weapon.default;
}

function parseCategory(templateId: string): StwInventoryCategory | null {
  if (templateId.startsWith('Ammo:')) return 'ammo';
  if (templateId.startsWith('Weapon:')) return 'weapons';
  if (templateId.startsWith('Trap:')) return 'traps';
  if (templateId.startsWith('WorldItem:')) return 'materials';
  if (templateId.startsWith('Ingredient:')) return 'ingredients';
  return null;
}

/** Orden por defecto en imagen/lista: armas → trampas → ingredientes → resto. */
const CATEGORY_SORT_ORDER: Record<StwInventoryCategory, number> = {
  weapons: 1,
  traps: 2,
  ammo: 3,
  ingredients: 4,
  materials: 5,
};

export function inventoryMergeKey(
  templateId: string,
  categoria: StwInventoryCategory,
  nombre: string,
  rareza: StwInventoryRarityCode | null,
  nivel: number,
): string {
  if (categoria === 'weapons' || categoria === 'traps') {
    return `${nombre}::${rareza ?? 'x'}::${nivel}`;
  }
  if (categoria === 'ingredients') {
    const rawId = templateId.split(':')[1] ?? '';
    const catalogKey = resolveIngredientCatalogKey(normalizeIngredientCatalogId(rawId));
    return `${catalogKey}::${nivel}`;
  }
  return `${nombre}::${nivel}`;
}

function prioridadCategoria(cat: StwInventoryCategory): number {
  return CATEGORY_SORT_ORDER[cat] ?? 99;
}

export function sortInventoryItems(items: StwInventoryItem[]): StwInventoryItem[] {
  return [...items].sort((a, b) => {
    const catA = CATEGORY_SORT_ORDER[a.categoria] ?? 99;
    const catB = CATEGORY_SORT_ORDER[b.categoria] ?? 99;
    if (catA !== catB) return catA - catB;

    const ra = a.rareza ?? 'z';
    const rb = b.rareza ?? 'z';
    if (ORDEN_RAREZA[ra] !== ORDEN_RAREZA[rb]) {
      return (ORDEN_RAREZA[ra] ?? 99) - (ORDEN_RAREZA[rb] ?? 99);
    }
    if (a.nivel !== b.nivel) return b.nivel - a.nivel;
    return a.nombre.localeCompare(b.nombre);
  });
}

function extractProfileItems(profileBody: unknown): Record<string, any> {
  const body = profileBody as {
    profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }>;
    data?: { profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }> };
  };
  return (body?.profileChanges?.[0]?.profile?.items
    ?? body?.data?.profileChanges?.[0]?.profile?.items
    ?? {}) as Record<string, any>;
}

export async function fetchStwInventoryItems(
  accountId: string,
  accessToken: string,
  source: StwInventorySource,
  lang: SupportedLanguage,
  profileBody?: unknown,
): Promise<StwInventoryItem[]> {
  const catalogs = loadStwAssetCatalogs();
  const items: Record<string, any> = profileBody
    ? extractProfileItems(profileBody)
    : extractProfileItems(await composeMCP({
      profile: STW_INVENTORY_PROFILE[source],
      operation: 'QueryProfile',
      accountId,
      accessToken,
      body: {},
    }));
  const merged = new Map<string, StwInventoryItem>();

  for (const itemData of Object.values(items)) {
    const templateId = String(itemData?.templateId ?? '');
    const categoria = parseCategory(templateId);
    if (!categoria) continue;

    if (!isDisplayableStwInventoryItem(templateId, lang, catalogs)) continue;

    const nombre = getStwItemTranslation(templateId, lang);
    if (!nombre) continue;

    const startingRarity = itemData?.attributes?.starting_rarity as string | undefined;
    const rareza = resolveStwInventoryItemRarity(templateId, startingRarity);
    const emojiMarkup = emojiForItem(templateId, nombre);
    const cantidad = Number(itemData?.quantity ?? 1);
    const levelJuego = Number(itemData?.attributes?.level ?? 0);
    const nivel = resolveInventoryPowerLevel(categoria, levelJuego, rareza);
    const key = inventoryMergeKey(templateId, categoria, nombre, rareza, nivel);

    const existing = merged.get(key);
    if (existing) {
      existing.cantidad += cantidad;
      existing.stacks += 1;
    } else {
      merged.set(key, {
        templateId,
        nombre,
        emojiMarkup,
        iconUrl: discordEmojiToCdnUrl(emojiMarkup),
        cantidad,
        stacks: 1,
        nivel,
        rareza,
        categoria,
        prioridad: prioridadCategoria(categoria),
      });
    }
  }

  return sortInventoryItems(Array.from(merged.values()));
}
