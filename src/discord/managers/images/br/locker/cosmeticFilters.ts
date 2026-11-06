import axios, { type AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import exclusivesData from '#helpers/data/maps/exclusives.json' with { type: 'json' };

// Crear Set con todos los IDs exclusivos del JSON (todas las categorías)
const EXCLUSIVE_IDS = new Set<string>(
  Object.values(exclusivesData)
    .flatMap(category => Object.keys(category))
    .map(id => id.toLowerCase())
);

// Axios optimizado con keep-alive
const axiosInstance: AxiosInstance = axios.create({
  timeout: 30000,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip, deflate' },
  decompress: true,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
});

// Cache para datos de cosméticos extendidos
let extendedCosmeticsCache: Map<string, ExtendedCosmeticData> | null = null;
let extendedCacheTimestamp: number | null = null;
const EXTENDED_CACHE_TTL = 60 * 60 * 1000; // 1 hora

export interface ExtendedCosmeticData {
  id: string;
  name: string;
  type: string;
  backendType: string;
  rarity: string;
  series: string | null;
  chapter: number | null;
  season: string | null;
  lastAppearance: number | null; // Unix timestamp
  added: string | null;
  isExclusive: boolean; // Based on exclusives.json IDs
}

export interface LockerFilters {
  types: string[]; // ['all'] or ['outfit', 'backpack', ...]
  rarities: string[]; // ['all'] or ['legendary', 'epic', 'marvel', ...]
  chapters: string[]; // ['all'] or ['1', '2', '3', ...]
  exclusive: boolean; // true = only exclusives (based on exclusives.json IDs)
}

// Tipos de cosméticos válidos
export const COSMETIC_TYPES = [
  'all', 'outfit', 'backpack', 'pickaxe', 'glider', 'emote',
  'spray', 'emoticon', 'toy', 'wrap', 'music', 'loadingscreen', 'contrail',
  'companion', 'shoes', 'vehicle',
] as const;

// Rarezas disponibles (ordenadas por peso)
export const RARITY_OPTIONS = [
  { value: 'all', label: 'All Rarities', weight: 0 },
  { value: 'gaminglegends', label: 'Gaming Legends', weight: 200 },
  { value: 'marvel', label: 'Marvel', weight: 190 },
  { value: 'starwars', label: 'Star Wars', weight: 180 },
  { value: 'dc', label: 'DC', weight: 170 },
  { value: 'icon', label: 'Icon Series', weight: 160 },
  { value: 'dark', label: 'Dark Series', weight: 150 },
  { value: 'shadow', label: 'Shadow Series', weight: 140 },
  { value: 'slurp', label: 'Slurp Series', weight: 130 },
  { value: 'frozen', label: 'Frozen Series', weight: 120 },
  { value: 'lava', label: 'Lava Series', weight: 110 },
  { value: 'legendary', label: 'Legendary', weight: 100 },
  { value: 'epic', label: 'Epic', weight: 90 },
  { value: 'rare', label: 'Rare', weight: 80 },
  { value: 'uncommon', label: 'Uncommon', weight: 70 },
  { value: 'common', label: 'Common', weight: 60 },
] as const;

// Chapters disponibles
export const CHAPTER_OPTIONS = [
  { value: 'all', label: 'All Chapters', emoji: '' },
  { value: '1', label: 'Chapter 1', emoji: '' },
  { value: '2', label: 'Chapter 2', emoji: '' },
  { value: '3', label: 'Chapter 3', emoji: '' },
  { value: '4', label: 'Chapter 4', emoji: '' },
  { value: '5', label: 'Chapter 5', emoji: '' },
  { value: '6', label: 'Chapter 6', emoji: '' },
  { value: '7', label: 'Chapter 7', emoji: '' },
] as const;

// Filtro especial de exclusivos
export const EXCLUSIVE_OPTIONS = [
  { value: 'all', label: 'All Items' },
  { value: 'exclusive', label: 'Exclusives Only' },
] as const;

/**
 * Obtiene datos extendidos de cosméticos desde la API de Fortnite
 * Incluye información de chapter, lastAppearance, etc.
 */
export async function fetchExtendedCosmeticsData(): Promise<Map<string, ExtendedCosmeticData>> {
  const now = Date.now();

  // Si el cache es válido, usarlo
  if (extendedCosmeticsCache && extendedCacheTimestamp && (now - extendedCacheTimestamp) < EXTENDED_CACHE_TTL) {
    return extendedCosmeticsCache;
  }

  // Obtener cosméticos BR + coches (vehículos)
  const [brResponse, carsResponse] = await Promise.all([
    axiosInstance.get('https://fortnite-api.com/v2/cosmetics/br', {
      params: { language: 'en' },
    }),
    axiosInstance.get('https://fortnite-api.com/v2/cosmetics/cars', {
      params: { language: 'en' },
    }),
  ]);

  const cosmetics = [...(brResponse.data?.data || []), ...(carsResponse.data?.data || [])];
  const map = new Map<string, ExtendedCosmeticData>();

  for (const cosmetic of cosmetics) {
    if (!cosmetic?.id) continue;

    // Extraer chapter del introductionChapter (puede ser string como "Chapter 2")
    let chapter: number | null = null;
    if (cosmetic.introduction?.chapter) {
      const chapterStr = cosmetic.introduction.chapter.toString();
      const match = chapterStr.match(/\d+/);
      if (match) {
        chapter = parseInt(match[0]);
      }
    }

    // Obtener lastAppearance
    const lastAppearance = cosmetic.lastAppearance ? new Date(cosmetic.lastAppearance).getTime() : null;

    // Exclusivo = ID está en exclusives.json
    const isExclusive = EXCLUSIVE_IDS.has(cosmetic.id.toLowerCase());

    // Obtener la rareza (puede venir de series o rarity)
    let rarity = cosmetic.rarity?.value?.toLowerCase() || 'common';
    if (cosmetic.series?.value) {
      // Si tiene series, usar el valor de la series como rareza
      const seriesValue = cosmetic.series.value.toLowerCase().replace('series', '').trim();
      if (seriesValue) {
        rarity = seriesValue;
      }
    }

    map.set(cosmetic.id.toLowerCase(), {
      id: cosmetic.id,
      name: cosmetic.name || 'Unknown',
      type: cosmetic.type?.value?.toLowerCase() || 'unknown',
      backendType: cosmetic.type?.backendValue || '',
      rarity: rarity,
      series: cosmetic.series?.value || null,
      chapter: chapter,
      season: cosmetic.introduction?.season || null,
      lastAppearance: lastAppearance,
      added: cosmetic.added || null,
      isExclusive: isExclusive,
    });
  }

  // Guardar en cache
  extendedCosmeticsCache = map;
  extendedCacheTimestamp = now;

  return map;
}

/**
 * Filtra una lista de IDs de cosméticos según los filtros proporcionados
 */
export async function filterCosmeticIds(
  cosmeticIds: string[],
  filters: LockerFilters
): Promise<string[]> {
  // Si no hay filtros activos, devolver todos
  const hasRarityFilter = !filters.rarities.includes('all');
  const hasChapterFilter = !filters.chapters.includes('all');

  if (!hasRarityFilter && !hasChapterFilter && !filters.exclusive) {
    return cosmeticIds;
  }

  // Obtener datos extendidos
  const extendedData = await fetchExtendedCosmeticsData();

  return cosmeticIds.filter(id => {
    const data = extendedData.get(id.toLowerCase());
    if (!data) return true; // Si no hay datos, incluir por defecto

    // Filtro de exclusivos
    if (filters.exclusive && !data.isExclusive) {
      return false;
    }

    // Filtro de rareza (ahora es array)
    if (hasRarityFilter) {
      const cosmeticRarity = data.rarity.toLowerCase();
      const seriesValue = data.series?.toLowerCase() || '';

      // Verificar si coincide con alguna rareza seleccionada
      const matchesRarity = filters.rarities.some(r => {
        const filterRarity = r.toLowerCase();
        return cosmeticRarity === filterRarity || seriesValue === filterRarity;
      });

      if (!matchesRarity) return false;
    }

    // Filtro de chapter (ahora es array)
    if (hasChapterFilter) {
      if (!filters.chapters.includes(String(data.chapter))) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Obtiene datos extendidos de un cosmético específico
 */
export async function getCosmeticExtendedData(cosmeticId: string): Promise<ExtendedCosmeticData | null> {
  const extendedData = await fetchExtendedCosmeticsData();
  return extendedData.get(cosmeticId.toLowerCase()) || null;
}

/**
 * Limpia el cache de datos extendidos
 */
export function clearExtendedCache(): void {
  extendedCosmeticsCache = null;
  extendedCacheTimestamp = null;
}

/**
 * Obtiene estadísticas del cache
 */
export function getExtendedCacheStats(): { cached: boolean; items: number; ageSeconds: number } {
  if (!extendedCosmeticsCache || !extendedCacheTimestamp) {
    return { cached: false, items: 0, ageSeconds: 0 };
  }

  return {
    cached: true,
    items: extendedCosmeticsCache.size,
    ageSeconds: Math.floor((Date.now() - extendedCacheTimestamp) / 1000),
  };
}

/**
 * Obtiene el label de una rareza para mostrar en el selectMenu
 */
export function getRarityLabel(value: string): string {
  const option = RARITY_OPTIONS.find(r => r.value === value);
  return option?.label || value;
}

/**
 * Obtiene el label de un chapter para mostrar en el selectMenu
 */
export function getChapterLabel(value: string): string {
  const option = CHAPTER_OPTIONS.find(c => c.value === value);
  return option?.label || `Chapter ${value}`;
}
