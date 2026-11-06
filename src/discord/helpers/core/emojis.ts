import type { Client } from 'discord.js';
import { log } from './logger.ts';
import { eByDiscordId } from '../epic/stw/alerts/emojiMap.ts';
import { isPremiumCheckBypassed } from './client/premium.ts';

/**
 * Sistema centralizado de emojis del bot
 * Permite usar emojis fácilmente sin declarar funciones en cada comando
 */

export const PREMIUM_EMOJI_KEYS = new Set<string>([
  'prem',
  'premium',
  'premium_booster',
  'premium_basic',
  'premium_pro',
  'premium_ultimate',
]);

export function isPremiumEmojiKey(name: string): boolean {
  return PREMIUM_EMOJI_KEYS.has(name);
}

export const EMOJI_IDS = {
  error: '1358910401223594115',
  cargando: '1532868847168917504',
  loading: '1532868847168917504', // Alias para cargando
  loadingai: '1505911004503085216',
  success: '1359260848132198674',
  warning: '1358911069413835023',
  info: 'ℹ️',
  login: '1358911681576697926',
  change: '1358912163804348616',
  add: '1358912662750368095',
  load: '1361117989059035288',
  delete: '1358913179425443840',
  join: '1407050618098683944',
  vbucks: '1348693071323332678',
  gift: '1367565273317507114',
  novbucks: '1367565108586221658',
  compra: '1415053011243491369',
  epicgames: '1485064766249766982',
  epic: '1485064766249766982',  // Alias para epicgames
  platform: '🎮',
  psn: '1384295677344878683',
  xbox: '1384295680516034700',
  nintendo: '1384295675935850576',
  android: '1415053018390335609',
  ios: '1415053017048154132',
  // AutoKick emojis
  emoji_53: '1464385468928884909',
  materials: '1384354398544728164',
  save: '1385071759887437924',
  kick: '1367565177570197614',
  rewards: '1407050614944436314',
  leave: '1407050616005460165',
  exit: '1407050616005460165',  // Emoji de expulsión/salida
  reinvite: '1407050620459941898',
  active: '1435659571472502794',  // Verde para activo
  inactive: '1435659569480204430',  // Rojo para inactivo
  prem: '1520012692683882667',
  premium: '1520012692683882667',  // legacy alias
  premium_booster: process.env.PREMIUM_EMOJI_BOOSTER_ID ?? '1529094895523070093',
  premium_basic: process.env.PREMIUM_EMOJI_BASIC_ID ?? '1529094787398107266',
  premium_pro: process.env.PREMIUM_EMOJI_PRO_ID ?? '1529095019791781958',
  premium_ultimate: process.env.PREMIUM_EMOJI_ULTIMATE_ID ?? '1520012692683882667',
  discord: '1349450341522870343',
  // STW & Stats emojis
  stats: '1399435155726270625',
  xp: '1367623311340605531',
  rayo: '1348693089790722050', // Power
  ata: '1367561037393694730', // Offense
  res: '1367561038785937519', // Resistance
  tec: '1367561040350675055', // Technology
  for: '1367561036055445554', // Fortitude
  // Server status emojis
  operational: '1400169448622788778',
  maintenance: '1400169455509573735',
  degraded: '1400169453815070740',
  partial_outage: '1400169450249916467',
  major_outage: '1400169452108255252',
  // Taxi status emojis
  online: '1467166006878404649',
  offline: '1467166055897235457',
  check: '1467167418144264449',
  busy: '1467168784040067175',
  timer: '1487375672283496508',
  // STW hero class emojis
  soldat:      '1491143179095773365',
  constructor: '1491143130639106088',
  ninja:       '1491143085634359430',
  outlander:   '1491142993090973746',
  // STW hero rarity emojis (from resources/voucher_generic_hero_*.png)
  hero_c:  '1480968268356522079',   // common
  hero_uc: '1480968281136304358',   // uncommon  (emoji name: esources_voucher_generic_hero_uc)
  hero_r:  '1480968274991911104',   // rare
  hero_vr: '1480968284126973972',   // epic       (emoji name: esources_voucher_generic_hero_vr)
  hero_sr: '1480968278082846900',   // legendary  (emoji name: esources_voucher_generic_hero_sr)
  hero_er: '1480968271137345601',   // mythic/ER  (emoji name: esources_voucher_generic_hero_er)
  // STW trap rarity emojis (voucher_generic_trap_*)
  trap_c:  '1480968374673604719',
  trap_uc: '1480968384060461148',
  trap_r:  '1480968377907417198',
  trap_vr: '1480968387134754877',
  trap_sr: '1480968381002813601',
  importante: '1541621418305912882',
  alert: '1566559811804594397', // amber warning triangle — auth/session errors
  // STW generic weapon rarity (voucher_generic_weapon_*; c/uc reuse rare — no separate upload)
  weapon_c:  '1480968390163038300',
  weapon_uc: '1480968390163038300',
  weapon_r:  '1480968390163038300',
  weapon_vr: '1480968396567740436',
  weapon_sr: '1480968393401176155',
  stw_power: '1480967211937173629', // STW power icon (power.png)
  stw_gold: '1480968110843367556',  // STW gold (resources_eventcurrency_scaling)

//difficulties
  stone: '1480974412986581012',
  plankerton: '1480974405369856020',
  canny: '1480974390773547221',
  twine: '1480974416555802736',
  ventures: '1480967215158132789',
  event: '1480967297311969423',
  sumup: '1480967243473879050',
  // Bulk pagination nav
  page_first: '1407050620459941898',
  page_prev: '1407050616005460165',
  page_next: '1407050618098683944',
  page_last: '1407050620459941898',
} as const;

function formatStaticEmoji(key: keyof typeof EMOJI_IDS, id: string): string {
  return `<:${key}:${id}>`;
}

/** CDN URL for Components V2 thumbnails (custom emoji strings often fail in TextDisplay headings). */
export function getEmojiCdnUrl(name: keyof typeof EMOJI_IDS, size = 48): string | null {
  if (isPremiumCheckBypassed() && isPremiumEmojiKey(name)) return null;
  const id = EMOJI_IDS[name];
  if (!id || isNaN(Number(id))) return null;
  return `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}`;
}

/**
 * Caché local de emojis resueltos (id -> string formateado)
 * Se rellena en warmupEmojis al arrancar el bot
 */
const resolvedEmojis = new Map<string, string>();

/**
 * Pre-carga todos los emojis del bot buscándolos en:
 * 1. client.emojis.cache (emojis de guilds ya cargados)
 * 2. client.application.emojis (emojis de aplicación, Discord.js v14.14+)
 * 3. guild.emojis.fetch() por cada guild del bot
 *
 * Debe llamarse en el evento clientReady después de que client.application esté disponible.
 */
export async function warmupEmojis(client: Client): Promise<void> {
  // Obtener todos los application emojis de una vez (más fiable que fetch por ID)
  let appEmojiCache: Map<string, any> | null = null;
  try {
    const fetched = await (client.application as any)?.emojis?.fetch();
    if (fetched) {
      appEmojiCache = fetched;
    }
  } catch { /* application emojis no soportados en esta versión */ }

  for (const [name, id] of Object.entries(EMOJI_IDS)) {
    if (isNaN(Number(id))) continue; // Skip emojis Unicode

    // 1. Ya en cache de guilds
    const cached = client.emojis.cache.get(id);
    if (cached) {
      resolvedEmojis.set(id, cached.toString());
      continue;
    }

    // 2. Application emojis (buscamos en el cache obtenido anteriormente)
    if (appEmojiCache) {
      const appEmoji = appEmojiCache.get(id);
      if (appEmoji) {
        resolvedEmojis.set(id, appEmoji.toString());
        continue;
      }
    }

    // 3. Buscar en guilds del bot
    let found = false;
    for (const guild of client.guilds.cache.values()) {
      try {
        const guildEmoji = await guild.emojis.fetch(id);
        if (guildEmoji) {
          resolvedEmojis.set(id, guildEmoji.toString());
          found = true;
          break;
        }
      } catch { /* no está en este guild */ }
    }

    if (!found) {
      const fromExport = eByDiscordId(id, '');
      resolvedEmojis.set(
        id,
        fromExport || formatStaticEmoji(name as keyof typeof EMOJI_IDS, id),
      );
    }
  }
}

/**
 * Obtiene un emoji del bot
 * @param client Cliente de Discord
 * @param name Nombre del emoji (key de EMOJI_IDS)
 * @returns Emoji formateado
 */
export function getPremiumEmojiName(paidTierLevel: number): keyof typeof EMOJI_IDS | null {
  if (isPremiumCheckBypassed()) return null;
  if (paidTierLevel >= 3) return 'premium_ultimate';
  if (paidTierLevel >= 2) return 'premium_pro';
  if (paidTierLevel >= 1) return 'premium_basic';
  return 'premium';
}

export function getEmoji(client: Client, name: keyof typeof EMOJI_IDS): string {
  if (isPremiumCheckBypassed() && isPremiumEmojiKey(name)) {
    return '';
  }

  const id = EMOJI_IDS[name];

  // Si es un emoji Unicode (no tiene ID numérico), devolverlo directamente
  if (isNaN(Number(id))) {
    return id;
  }

  // 1. Pre-resuelto por warmupEmojis (prefer export name when cache used wrong key)
  const resolved = resolvedEmojis.get(id);
  if (resolved) {
    const fromExport = eByDiscordId(id, '');
    if (fromExport && fromExport !== resolved) {
      resolvedEmojis.set(id, fromExport);
      return fromExport;
    }
    return resolved;
  }

  // 2. Caché de emojis de guilds
  const emoji = client.emojis.cache.get(id);
  if (emoji) return emoji.toString();

  // 3. Application emojis cache (no están en client.emojis, tienen su propio manager)
  const appEmoji = (client.application as any)?.emojis?.cache?.get(id);
  if (appEmoji) {
    const str = appEmoji.toString();
    resolvedEmojis.set(id, str); // guardar para siguientes llamadas
    return str;
  }

  // 4. Export uso_en_mensaje (correct Discord name) before static key fallback
  const fromExport = eByDiscordId(id, '');
  if (fromExport) {
    resolvedEmojis.set(id, fromExport);
    return fromExport;
  }

  // 5. Formato estático como último recurso (name key may differ from live emoji name)
  const staticEmoji = formatStaticEmoji(name, id);
  log.commands.warn({ name, id, staticEmoji }, '[emojis] app emoji not in cache, using static fallback');
  return staticEmoji;
}

export function getEmojiButtonComponent(
  name: keyof typeof EMOJI_IDS,
): { id: string; name: string } | undefined {
  if (isPremiumCheckBypassed() && isPremiumEmojiKey(name)) {
    return undefined;
  }
  const id = EMOJI_IDS[name];
  if (!id || isNaN(Number(id))) return undefined;
  return { id, name };
}

/**
 * Clase helper para acceder a emojis de forma más limpia
 * Uso: const emoji = new EmojiHelper(client); emoji.error
 */
export class EmojiHelper {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }
  
  get error(): string {
    return getEmoji(this.client, 'error');
  }
  
  get cargando(): string {
    return getEmoji(this.client, 'cargando');
  }

  get loadingai(): string {
    return getEmoji(this.client, 'loadingai');
  }
  
  get success(): string {
    return getEmoji(this.client, 'success');
  }
  
  get warning(): string {
    return getEmoji(this.client, 'warning');
  }
  
  get info(): string {
    return getEmoji(this.client, 'info');
  }
  
  get login(): string {
    return getEmoji(this.client, 'login');
  }
  
  get change(): string {
    return getEmoji(this.client, 'change');
  }
  
  get add(): string {
    return getEmoji(this.client, 'add');
  }
  
  get load(): string {
    return getEmoji(this.client, 'load');
  }
  
  get delete(): string {
    return getEmoji(this.client, 'delete');
  }
  
  get join(): string {
    return getEmoji(this.client, 'join');
  }
  
  get vbucks(): string {
    return getEmoji(this.client, 'vbucks');
  }
  
  get gift(): string {
    return getEmoji(this.client, 'gift');
  }
  
  get novbucks(): string {
    return getEmoji(this.client, 'novbucks');
  }

  get compra(): string {
    return getEmoji(this.client, 'compra');
  }
  
  get epic(): string {
    return getEmoji(this.client, 'epicgames');
  }
  
  get platform(): string {
    return getEmoji(this.client, 'platform');
  }
  
  get psn(): string {
    return getEmoji(this.client, 'psn');
  }
  
  get xbox(): string {
    return getEmoji(this.client, 'xbox');
  }
  
  get nintendo(): string {
    return getEmoji(this.client, 'nintendo');
  }
  
  get android(): string {
    return getEmoji(this.client, 'android');
  }
  
  get ios(): string {
    return getEmoji(this.client, 'ios');
  }
  
  get premium(): string {
    return getEmoji(this.client, 'premium');
  }
  
  get active(): string {
    return getEmoji(this.client, 'active');
  }
  
  get inactive(): string {
    return getEmoji(this.client, 'inactive');
  }
  
  get online(): string {
    return getEmoji(this.client, 'online');
  }
  
  get offline(): string {
    return getEmoji(this.client, 'offline');
  }
  
  get check(): string {
    return getEmoji(this.client, 'check');
  }
  
  get busy(): string {
    return getEmoji(this.client, 'busy');
  }

  get timer(): string {
    return getEmoji(this.client, 'timer');
  }

  get stone(): string {
    return getEmoji(this.client, 'stone');
  }

  get plankerton(): string {
    return getEmoji(this.client, 'plankerton');
  }

  get canny(): string {
    return getEmoji(this.client, 'canny');
  }

  get twine(): string {
    return getEmoji(this.client, 'twine');
  }

  get ventures(): string {
    return getEmoji(this.client, 'ventures');
  }

  get event(): string {
    return getEmoji(this.client, 'event');
  }

  get sumup(): string {
    return getEmoji(this.client, 'sumup');
  }
}

/**
 * Looks up an application emoji by its exact name (as uploaded).
 * Falls back to `<:name:0>` if not found in cache.
 */
export function getAppEmojiByName(client: Client, name: string): string {
  const cache = (client.application as any)?.emojis?.cache;
  if (cache) {
    for (const emoji of cache.values()) {
      if (emoji.name === name) return emoji.toString();
    }
  }
  return `<:${name}:0>`;
}
