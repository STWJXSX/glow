import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Same category rules as `/resources` embed — only known STW account resources. */
const DISPLAY_CATEGORY_MATCHERS: string[] = [
  'currency_mtxswap', 'mtxgiveaway', 'currency_mtxpurchased',
  'cupón para pavos', 'billetes de rayos x', 'monedas diarias',
  'currency_xrayllama', 'oro', 'billetes', 'tickets', 'caramelos',
  'moneda del evento de campaña', 'eventcurrency_scaling', 'eventcurrency_',
  'phoenixxp', 'heroxp', 'peoplexp', 'personnelxp', 'survivors_xp', 'schematicxp',
  'pe de aventura', 'pe de héroe', 'pe de superviviente', 'pe de esquemas',
  'smallxpboost', 'potenciador de pe',
  'gotas puras de lluvia', 'rayo en una botella', 'ojo de la tormenta',
  'fragmento de tormenta', 'reagent_c_t0',
  'flujo épico', 'flujo raro', 'flujo legendario', 'reagent_evolverarity_',
  '¡aventajado!', '¡a fuego!', '¡bajo cero!', '¡naturalista!', '¡ventajista!',
  'reagent_alteration_',
  'cupón de investigación', 'cupón de reclutamiento',
  'ficha de reasignación',
  'manual de entrenamiento', 'diseños de armas', 'diseños de trampas',
  'reagent_weapons', 'reagent_traps', 'reagent_people', 'reagent_schematic',
  'minillama', 'voucher_basicpack', 'voucher_cardpack',
];

let esES: Record<string, string> | null = null;

function loadEsES(): Record<string, string> {
  if (!esES) {
    const filePath = resolve(process.cwd(), 'src/discord/helpers/data/maps/es-ES.json');
    esES = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, string>;
  }
  return esES;
}

export function translateStwResourceTemplateId(templateId: string): string {
  const map = loadEsES();
  if (map[templateId]) return map[templateId];

  return templateId
    .replace(/^AccountResource:/i, '')
    .replace(/^Token:/i, '')
    .replace(/^Currency:/i, '')
    .replace(/^ConsumableAccountItem:/i, '')
    .replace(/^CardPack:/i, '');
}

export function isDisplayableStwAccountResource(templateId: string): boolean {
  if (!templateId.startsWith('AccountResource:')) return false;

  const id = templateId.toLowerCase();
  const name = translateStwResourceTemplateId(templateId).toLowerCase();

  return DISPLAY_CATEGORY_MATCHERS.some(
    (needle) => id.includes(needle) || name.includes(needle),
  );
}
