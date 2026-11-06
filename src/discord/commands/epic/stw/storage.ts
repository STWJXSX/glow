import {
  SlashCommandBuilder,
  EmbedBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { runStwInventoryImagePanel } from '#helpers/epic/stw/inventory/stwInventoryImagePanel.ts';

const logger = log.commands;

// Cargar traducciones
const esESPath = resolve(process.cwd(), 'src/discord/helpers/data/maps/es-ES.json');
const enUSPath = resolve(process.cwd(), 'src/discord/helpers/data/maps/en-US.json');
const esES: Record<string, string> = JSON.parse(readFileSync(esESPath, 'utf-8'));
const enUS: Record<string, string> = JSON.parse(readFileSync(enUSPath, 'utf-8'));

// Helper MCP
async function composeMCP(options: {
  profile: string;
  operation: string;
  route?: string;
  accountId: string;
  accessToken: string;
  returnProfile?: boolean;
  logError?: boolean;
  body?: any;
}): Promise<any> {
  const { profile, operation, route = 'client', accountId, accessToken, returnProfile = false, logError = false, body = {} } = options;
  
  try {
    const url = `${Endpoints.MCP}/${accountId}/${route}/${operation}?profileId=${profile}&rvn=-1`;
    
    logger.info({ url, accountId, operation, route, profile }, '[storage] MCP Request');
    
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    logger.info({ operation, route, success: true }, '[storage] MCP Response OK');
    
    if (returnProfile) {
      return res.data.profileChanges[0].profile;
    }
    return res.data;
  } catch (err: any) {
    if (logError) {
      logger.error({ error: err?.response?.data || err, operation, route }, '[storage] MCP Error');
    }
    throw err;
  }
}

// Emojis por rareza
const rarezaEmojis = {
  weapon: {
    c: "<:weapon_common:1400145933055768072>",
    uc: "<:weapon_uncommon:1400145935121869312>",
    r: "<:weapon_rare:1400145931944595599>", 
    vr: "<:weapon_epic:1400145936541421598>", 
    sr: "<:weapon_legendary:1400145934402326669>", 
    default: "<:esquema:1364580858329174067>"
  },
  trap: {
    c: "<:trapd:1400149486030028891>",
    uc: "<:trapp:1400149454253981696>",
    r: "<:trapr:1400149451170910318>",
    vr: "<:trape:1400149456292413550>",
    sr: "<:trapl:1400149452525932601>",
    default: "<:trampa:1364581932469456916>"
  }
};

// Emojis de materiales
const nombreEmojis: Record<string, string> = {
  // ESPAÑOL
  "Cordel firme": "<:sturdy:1364575459345567784>",
  "Cordel paliducho": "<:stingy:1364575462420123648>",
  "Cordel esculpido": "<:esculpido:1364575456254230569>",
  "Cordel simple": "<:simple:1364575461035999353>",
  "Cordel fibroso": "<:peaky:1364575457776898078>",
  "Polvo de mineral oxidado": "<:oxidado:1364575951278837760>",
  "Polvo de mineral negro carbón": "<:polvonegrocarbon:1364575999223664650>",
  "Polvo de mineral fino": "<:polvofino:1364575489561198662>",
  "Polvo de mineral simple": "<:polvosimple:1364575976918487111>",
  "Polvo de mineral tosco": "<:tosco:1364575485958295642>",
  "Mena de plata": "<:menaplata:1364575813864919141>",
  "Mena de obsidiana": "<:obsidiana:1364575469344788592>",
  "Mena de malaquita": "<:malaquita:1364575470632304701>",
  "Mena de cobre": "<:menacobre:1364575475032260698>",
  "Mena de radiantita": "<:radiantita:1364575466228285500>",
  "Carbón": "<:carbon:1364572472531353630>",
  "Mena en bruto": "<:menabruto:1408545968420552814>",
  "Tablones": "<:tablones:1364572492064227410>",
  "Resina adhesiva": "<:resina:1408545796902621214>",
  "Turcas y tornillos": "<:tornillos:1408550769556328580>",
  "Piezas mecánicas lustrosas": "<:lustrosas:1364575478777774080>",
  "Piezas mecánicas eficientes": "<:eficiente:1364575842067419217>",
  "Piezas mecánicas firmes": "<:mecanicas:1364575902297620480>",
  "Piezas mecánicas simples": "<:piezamecanicasimple:1364575482120638464>",
  "Piezas mecánicas oxidadas": "<:mecanicas2bajas1:1364576249204179008>",
  "Hierbas fibrosas": "<:fibrosas:1364572489006714910>",
  "Pétalos de flores": "<:flores:1364572480450199592>",
  "Cristal de cuarzo": "<:cuarzo:1364580869582491659>",
  "Cristal de rayosol": "<:rayosol:1364575464793837640>",
  "Cristal de pizcasombra": "<:pizcasombra:1364575467457347624>",
  "Polvo explosivo": "<:explosivo:1364572476536918047>",
  "Pilas": "<:pilas:1364572478185144340>",
  "Beicon": "<:beicon:1364572474678710363>",
  "Cinta americana": "<:cinta:1364572481758822421>",
  "Tornillos": "<:tornillos:1364572494324961401>",
  "Batería activa": "<:bateria:1364572484195717193>",
  "Chisme giratorio": "<:giratorio:1364572485823234109>",
  "Balas ligeras": "<:pequenas:1408546616415223890>",
  "Balas medianas": "<:medianas:1408546634312450182>",
  "Balas pesadas": "<:pesadas:1408546613705834636>",
  "Cartuchos": "<:cartuchos:1408546621091741837>",
  "Munición: célula de energía": "<:celula:1408546631246282875>",
  "Munición: explosiva": "<:explosivas:1408546626326237334>",
  "Madera": "<:madera:1408546325687042048>",
  "Piedra": "<:piedra:1408546290236784640>",
  "Metal": "<:metal:1408546246590730441>",
  // INGLÉS
  "Sturdy Twine": "<:sturdy:1364575459345567784>",
  "Stringy Twine": "<:stingy:1364575462420123648>",
  "Carved Twine": "<:esculpido:1364575456254230569>",
  "Simple Twine": "<:simple:1364575461035999353>",
  "Peaky Twine": "<:peaky:1364575457776898078>",
  "Oxidized Mineral Powder": "<:oxidado:1364575951278837760>",
  "Char-black Mineral Powder": "<:polvonegrocarbon:1364575999223664650>",
  "Fine-grain Mineral Powder": "<:polvofino:1364575489561198662>",
  "Simple Mineral Powder": "<:polvosimple:1364575976918487111>",
  "Rough Mineral Powder": "<:tosco:1364575485958295642>",
  "Silver Ore": "<:menaplata:1364575813864919141>",
  "Obsidian Ore": "<:obsidiana:1364575469344788592>",
  "Malachite Ore": "<:malaquita:1364575470632304701>",
  "Copper Ore": "<:menacobre:1364575475032260698>",
  "Brightcore Ore": "<:radiantita:1364575466228285500>",
  "Coal": "<:carbon:1364572472531353630>",
  "Rough Ore": "<:menabruto:1408545968420552814>",
  "Planks": "<:tablones:1364572492064227410>",
  "Adhesive Resin": "<:resina:1408545796902621214>",
  "Nuts 'n' Bolts": "<:tornillos:1408550769556328580>",
  "Sleek Mechanical Parts": "<:lustrosas:1364575478777774080>",
  "Efficient Mechanical Parts": "<:eficiente:1364575842067419217>",
  "Sturdy Mechanical Parts": "<:mecanicas:1364575902297620480>",
  "Simple Mechanical Parts": "<:piezamecanicasimple:1364575482120638464>",
  "Rusty Mechanical Parts": "<:mecanicas2bajas1:1364576249204179008>",
  "Fibrous Herbs": "<:fibrosas:1364572489006714910>",
  "Flower Petals": "<:flores:1364572480450199592>",
  "Quartz Crystal": "<:cuarzo:1364580869582491659>",
  "Sunbeam Crystal": "<:rayosol:1364575464793837640>",
  "Shadowshard Crystal": "<:pizcasombra:1364575467457347624>",
  "Blast Powder": "<:explosivo:1364572476536918047>",
  "Batteries": "<:pilas:1364572478185144340>",
  "Bacon": "<:beicon:1364572474678710363>",
  "Duct Tape": "<:cinta:1364572481758822421>",
  "Screws": "<:tornillos:1364572494324961401>",
  "Active Powercell": "<:bateria:1364572484195717193>",
  "Rotating Gizmo": "<:giratorio:1364572485823234109>",
  "Light Bullets": "<:pequenas:1408546616415223890>",
  "Medium Bullets": "<:medianas:1408546634312450182>",
  "Heavy Bullets": "<:pesadas:1408546613705834636>",
  "Shells 'n'Slugs": "<:cartuchos:1408546621091741837>",
  "Energy cell": "<:celula:1408546631246282875>",
  "Explosive": "<:explosivas:1408546626326237334>",
  "Wood": "<:madera:1408546325687042048>",
  "Stone": "<:piedra:1408546290236784640>",
  "metalitemdata": "<:metal:1408546246590730441>",
};

// Tablas de conversión de niveles
const nivelesReales: Record<string, Record<number, number>> = {
  c: {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
    11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20,
    21: 20, 22: 21, 23: 22, 24: 23, 25: 24, 26: 25, 27: 26, 28: 27, 29: 28, 30: 29,
    31: 29, 32: 30, 33: 31, 34: 32, 35: 33, 36: 34, 37: 35, 38: 36, 39: 37, 40: 38,
    41: 38, 42: 39, 43: 40, 44: 41, 45: 42, 46: 43, 47: 44, 48: 45, 49: 46, 50: 47
  },
  uc: {
    1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 13, 9: 14, 10: 15,
    11: 17, 12: 18, 13: 19, 14: 20, 15: 21, 16: 23, 17: 24, 18: 25, 19: 26, 20: 27,
    21: 38, 22: 39, 23: 40, 24: 41, 25: 42, 26: 43, 27: 45, 28: 46, 29: 47, 30: 48,
    31: 67, 32: 68, 33: 70, 34: 71, 35: 72, 36: 74, 37: 75, 38: 77, 39: 78, 40: 80,
    41: 101, 42: 102, 43: 103, 44: 104, 45: 105, 46: 107, 47: 108, 48: 110, 49: 111, 50: 112
  },
  r: {
    1: 10, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 18, 9: 19, 10: 20,
    11: 21, 12: 23, 13: 24, 14: 26, 15: 27, 16: 29, 17: 30, 18: 32, 19: 33, 20: 34,
    21: 43, 22: 44, 23: 46, 24: 48, 25: 49, 26: 50, 27: 51, 28: 53, 29: 54, 30: 55,
    31: 72, 32: 75, 33: 77, 34: 80, 35: 81, 36: 83, 37: 84, 38: 86, 39: 87, 40: 89,
    41: 110, 42: 111, 43: 112, 44: 114, 45: 115, 46: 116, 47: 118, 48: 119, 49: 120, 50: 122
  },
  vr: {
    1: 9, 2: 11, 3: 12, 4: 14, 5: 15, 6: 17, 7: 18, 8: 20, 9: 21, 10: 22,
    11: 23, 12: 24, 13: 25, 14: 26, 15: 28, 16: 29, 17: 30, 18: 32, 19: 33, 20: 34,
    21: 44, 22: 45, 23: 46, 24: 48, 25: 49, 26: 50, 27: 51, 28: 53, 29: 54, 30: 55,
    31: 72, 32: 75, 33: 77, 34: 80, 35: 81, 36: 83, 37: 84, 38: 86, 39: 87, 40: 89,
    41: 110, 42: 111, 43: 112, 44: 114, 45: 115, 46: 116, 47: 118, 48: 119, 49: 120, 50: 122,
    52: 124, 54: 127, 56: 129, 58: 132, 60: 135
  },
  sr: {
    1: 12, 2: 14, 3: 15, 4: 17, 5: 18, 6: 20, 7: 21, 8: 23, 9: 24, 10: 26,
    11: 36, 12: 38, 13: 39, 14: 41, 15: 42, 16: 44, 17: 45, 18: 47, 19: 48, 20: 50,
    21: 60, 22: 62, 23: 63, 24: 65, 25: 66, 26: 68, 27: 69, 28: 71, 29: 72, 30: 74,
    31: 84, 32: 86, 33: 87, 34: 89, 35: 90, 36: 92, 37: 93, 38: 95, 39: 96, 40: 98,
    41: 116, 42: 118, 43: 119, 44: 121, 45: 122, 46: 124, 47: 125, 48: 127, 49: 128, 50: 130,
    52: 133, 54: 136, 56: 139, 58: 142, 60: 144
  }
};

const ordenRarezas: Record<string, number> = {
  'sr': 1, 'vr': 2, 'r': 3, 'uc': 4, 'c': 5
};

function traducir(key: string, userLanguage: string = 'es'): string {
  if (!key) return '';
  
  const traducciones = userLanguage === 'en' ? enUS : esES;
  
  // Buscar traducción directa
  if (traducciones[key]) return traducciones[key];
  
  // Limpiar prefijos y buscar de nuevo
  let cleaned = key;
  if (key.startsWith("Ingredient:")) {
    cleaned = key.replace("Ingredient:", "");
    if (traducciones[cleaned]) return traducciones[cleaned];
    return cleaned;
  }
  if (key.startsWith("Ammo:")) {
    cleaned = key.replace("Ammo:", "").replace("Ammo", "").replace("ammodata", "");
    if (traducciones[cleaned]) return traducciones[cleaned];
    return cleaned;
  }
  if (key.startsWith("WorldItem:")) {
    cleaned = key.replace("WorldItem:", "").replace("WorldResource", "").replace("itemdata", "");
    if (traducciones[cleaned]) return traducciones[cleaned];
    return cleaned;
  }
  if (key.startsWith("Trap:")) {
    cleaned = key.replace("Trap:", "");
    if (traducciones[cleaned]) return traducciones[cleaned];
    return cleaned;
  }
  if (key.startsWith("Weapon:")) {
    cleaned = key.replace("Weapon:", "");
    if (traducciones[cleaned]) return traducciones[cleaned];
    return cleaned;
  }
  
  return key;
}

function extractRarity(templateId: string): string | null {
  if (!templateId) return null;
  const rarityMatch = templateId.match(/_(vr|sr|er|ur|r|uc|c)(?:_|$)/i);
  return rarityMatch ? rarityMatch[1].toLowerCase() : null;
}

function esTrampa(templateId: string, nombreTraducido: string): boolean {
  if (templateId.startsWith("Trap:")) return true;
  if (!nombreTraducido) return false;
  const nombre = nombreTraducido.toLowerCase();
  const palabrasTrampas = [
    "trampa", "trap", "de techo", "de suelo", "de pared", "ceiling", "floor", "wall",
    "campo eléctrico", "calambres", "caída", "gas de techo", "electric field",
    "lanzador", "fogata", "plataforma", "congelante", "pozo", "launcher", "campfire",
    "dardos", "dinamo", "luces", "pinchos", "santabárbara", "darts", "dynamo", "spikes"
  ];
  return palabrasTrampas.some(palabra => nombre.includes(palabra));
}

function convertirNivelReal(levelJuego: number, rareza: string | null): number {
  if (levelJuego === 0) return 1;
  if (rareza && nivelesReales[rareza] && nivelesReales[rareza][levelJuego]) {
    return nivelesReales[rareza][levelJuego];
  }
  return levelJuego;
}

function ponerEmojiConRareza(templateId: string, nombreTraducido: string): string {
  if (!templateId) return '❔';

  if (nombreEmojis[nombreTraducido]) {
    return nombreEmojis[nombreTraducido];
  }

  const rareza = extractRarity(templateId);
  const isTrap = esTrampa(templateId, nombreTraducido);

  if (isTrap) {
    if (rareza && rarezaEmojis.trap[rareza as keyof typeof rarezaEmojis.trap]) {
      return rarezaEmojis.trap[rareza as keyof typeof rarezaEmojis.trap];
    }
    return rarezaEmojis.trap.default;
  } else {
    if (rareza && rarezaEmojis.weapon[rareza as keyof typeof rarezaEmojis.weapon]) {
      return rarezaEmojis.weapon[rareza as keyof typeof rarezaEmojis.weapon];
    }
    return rarezaEmojis.weapon.default;
  }
}

function getPrioridadCategoria(templateId: string): number {
  if (templateId.startsWith("Weapon:")) return 1;
  if (templateId.startsWith("Trap:")) return 2;
  if (templateId.startsWith("Ammo:")) return 3;
  if (templateId.startsWith("WorldItem:")) return 4;
  if (templateId.startsWith("Ingredient:")) return 5;
  return 6;
}

interface Item {
  templateId: string;
  nombre: string;
  emoji: string;
  cantidad: number;
  stacks: number;
  nivel: number;
  rareza: string | null;
  categoria: string;
  prioridad: number;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('storage')
    .setDescription('Shows your Save the World storage (outpost0)')
    .setNameLocalizations(buildDiscordLocalizations('storage.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('storage.cmd.description'))
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List storage contents as text')
        .setNameLocalizations(buildDiscordLocalizations('storage.cmd.subcommands.list.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('storage.cmd.subcommands.list.description'))
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Filter by item category')
            .setNameLocalizations(buildDiscordLocalizations('storage.cmd.subcommands.list.options.category.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('storage.cmd.subcommands.list.options.category.description'))
            .addChoices(
              { name: "Weapons / Armas", value: "Armas" },
              { name: "Traps / Trampas", value: "Trampas" },
              { name: "Ammo / Munición", value: "Munición" },
              { name: "Basic Materials / Materiales Básicos", value: "Materiales Básicos" },
              { name: "Ingredients / Ingredientes", value: "Ingredientes" }
            )
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('image')
        .setDescription('Storage image with filters')
        .setNameLocalizations(buildDiscordLocalizations('storage.cmd.subcommands.image.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('storage.cmd.subcommands.image.description')),
    ) as SlashCommandBuilder,
  auth: true,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === 'image' || sub === 'imagen') {
      await runStwInventoryImagePanel(interaction, 'storage');
      return;
    }

    const userId = interaction.user.id;

    try {
      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'almacen.errors.unexpected'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const mainAccount = userDb.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'almacen.errors.unexpected'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const account = mainAccount;

      const userLocale = await UsuarioInfo.findOne({ id: userId });
      const userLanguage = (userLocale as any)?.idioma || 'es';

      logger.info({ accountId: account.accountId }, '[storage] Fetching outpost0 profile');

      let profileData: any;
      try {
        profileData = await composeMCP({
          profile: 'outpost0',
          operation: 'QueryProfile',
          accountId: account.accountId,
          accessToken: account.accessToken,
          returnProfile: true,
          logError: true
        });
      } catch (err: any) {
        const embed = await generarEmbedError('api', {
          apiError: err,
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (!profileData || !profileData.items) {
        const embed = new EmbedBuilder()
          .setColor('Red')
          .setDescription(await translateForUser(userId, 'almacen.errors.noStorage'));
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const categoriaFiltro = interaction.options.getString('category') || interaction.options.getString('categoria');

      const BLOCKED_NOMBRES = new Set([
        'buildingitemdata_floor',
        'buildingitemdata_roofs',
        'buildingitemdata_stair_w',
        'buildingitemdata_wall',
        'edittool',
      ]);

      const mergedMap = new Map<string, Item>();
      for (const [itemId, itemData] of Object.entries(profileData.items) as [string, any][]) {
        const templateId = itemData.templateId;

        if (!templateId.startsWith('Weapon:') &&
            !templateId.startsWith('Trap:') &&
            !templateId.startsWith('Ingredient:') &&
            !templateId.startsWith('Ammo:') &&
            !templateId.startsWith('WorldItem:')) {
          continue;
        }

        const nombreTraducido = traducir(templateId, userLanguage);
        if (BLOCKED_NOMBRES.has(nombreTraducido.toLowerCase())) continue;

        let categoria = '';
        
        if (templateId.startsWith('Weapon:')) categoria = 'Armas';
        else if (templateId.startsWith('Trap:')) categoria = 'Trampas';
        else if (templateId.startsWith('Ammo:')) categoria = 'Munición';
        else if (templateId.startsWith('WorldItem:')) categoria = 'Materiales Básicos';
        else if (templateId.startsWith('Ingredient:')) categoria = 'Ingredientes';

        if (categoriaFiltro && categoria !== categoriaFiltro) continue;

        const rareza = extractRarity(templateId);
        const emoji = ponerEmojiConRareza(templateId, nombreTraducido);
        const cantidad = itemData.quantity || 1;
        const levelJuego = itemData.attributes?.level || 0;
        const nivelReal = convertirNivelReal(levelJuego, rareza);

        const key = `${nombreTraducido}::${nivelReal}`;
        const existing = mergedMap.get(key);
        if (existing) {
          existing.cantidad += cantidad;
          existing.stacks++;
        } else {
          mergedMap.set(key, {
            templateId,
            nombre: nombreTraducido,
            emoji,
            cantidad,
            stacks: 1,
            nivel: nivelReal,
            rareza,
            categoria,
            prioridad: getPrioridadCategoria(templateId)
          });
        }
      }
      const items = Array.from(mergedMap.values());

      if (items.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('Orange')
          .setDescription(await translateForUser(userId, 'almacen.messages.emptyStorage', { emoji: '❌' }));
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      items.sort((a, b) => {
        if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
        const rarezaA = a.rareza || 'z';
        const rarezaB = b.rareza || 'z';
        if (ordenRarezas[rarezaA] !== ordenRarezas[rarezaB]) {
          return (ordenRarezas[rarezaA] || 99) - (ordenRarezas[rarezaB] || 99);
        }
        if (a.nivel !== b.nivel) return b.nivel - a.nivel;
        return a.nombre.localeCompare(b.nombre);
      });

      const porPagina = 15;
      const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));
      let paginaActual = 1;

      async function crearContainer(pag: number, buttonsExpired = false): Promise<ContainerBuilder> {
        const inicio = (pag - 1) * porPagina;
        const fin = inicio + porPagina;
        const itemsPagina = items.slice(inicio, fin);

        let desc = '';
        let categoriaActual = '';

        for (const item of itemsPagina) {
          if (item.categoria !== categoriaActual) {
            categoriaActual = item.categoria;
            const categoriaKey = categoriaActual === 'Armas' ? 'weapons' :
                                  categoriaActual === 'Trampas' ? 'traps' :
                                  categoriaActual === 'Munición' ? 'ammo' :
                                  categoriaActual === 'Materiales Básicos' ? 'basicMaterials' : 'ingredients';
            const categoriaTraducida = await translateForUser(userId, `almacen.categories.${categoriaKey}`);
            desc += `\n**${categoriaTraducida}:**\n`;
          }

          const nivelTexto = item.nivel > 0 ? ` Lv${item.nivel}` : '';
          const cantidadTexto = item.stacks > 1 ? ` x${item.cantidad} (x${item.stacks})` : ` x${item.cantidad}`;
          desc += `${item.emoji} ${item.nombre}${nivelTexto}${cantidadTexto}\n`;
        }

        const footerText = await translateForUser(userId, 'almacen.embed.footer', {
          current: pag,
          total: totalPaginas,
          count: items.length
        });

        const container = new ContainerBuilder()
          .setAccentColor(EMBED_COLORS.info)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${await translateForUser(userId, 'almacen.embed.title')}`)
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(desc.trim() || '-')
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${footerText}`)
          );

        if (totalPaginas > 1) {
          container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('anterior')
                .setLabel(await translateForUser(userId, 'almacen.buttons.previous'))
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pag === 1 || buttonsExpired),
              new ButtonBuilder()
                .setCustomId('siguiente')
                .setLabel(await translateForUser(userId, 'almacen.buttons.next'))
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pag === totalPaginas || buttonsExpired)
            )
          );
        }

        return container;
      }

      const msg = await interaction.editReply({
        embeds: [],
        components: [await crearContainer(paginaActual)],
        flags: MessageFlags.IsComponentsV2,
      } as any);

      if (totalPaginas > 1) {
        const collector = msg.createMessageComponentCollector({
          time: 20 * 60 * 1000,
        });

        collector.on('collect', async (i) => {
          if (i.user.id !== interaction.user.id) {
            await i.reply({
              content: await translateForUser(userId, 'almacen.buttons.onlyExecutor'),
              ephemeral: true,
            });
            return;
          }

          if (i.customId === 'anterior' && paginaActual > 1) {
            paginaActual--;
          } else if (i.customId === 'siguiente' && paginaActual < totalPaginas) {
            paginaActual++;
          }

          await i.update({
            components: [await crearContainer(paginaActual)],
            flags: MessageFlags.IsComponentsV2,
          } as any);
        });

        collector.on('end', async () => {
          try {
            await msg.edit({
              components: [await crearContainer(paginaActual, true)],
              flags: MessageFlags.IsComponentsV2,
            } as any);
          } catch (e) {
            // Ignore
          }
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error en comando storage');
      try {
        const embed = await generarEmbedError('custom', {
          descripcion: await translateForUser(userId, 'almacen.errors.unexpected'),
          client: interaction.client,
          interaction
        });
        await interaction.editReply({ embeds: [embed], components: [] });
      } catch (e) {
        logger.error({ error: e }, 'Error al enviar embed de error');
      }
    }
  },
};

export default command;
