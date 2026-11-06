import { Client, GatewayIntentBits, Collection, Options, Partials } from 'discord.js';
import { createRequire } from 'node:module';
import { resolve } from 'path';
import { log } from './helpers/core/logger.ts';
import { applyTlsConfiguration } from './helpers/core/tlsSetup.ts';
import { loadCommands } from './handlers/loadCommands.ts';
import { loadEvents } from './handlers/loadEvents.ts';
import type { ExtendedClient, Command } from './structures/types.ts';

import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url ?? __filename);

/** First ancestor containing system/config/paths.cjs (the monorepo root), or null when standalone. */
function findRepoRoot(): string | null {
  let cur = (import.meta.dirname ?? __dirname);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(cur, 'system', 'config', 'paths.cjs'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

const repoRoot = findRepoRoot();
if (repoRoot) {
  const { loadRootEnv, loadServiceEnv } = require(resolve(repoRoot, 'system/config/loadEnv.cjs'));
  loadRootEnv(repoRoot);
  loadServiceEnv(repoRoot, 'apps/bots/glow/.env', { override: true });
} else {
  // Standalone checkout: .env next to package.json.
  require('dotenv').config({ path: resolve((import.meta.dirname ?? __dirname), '../../.env') });
}

// Antivirus/proxy en Windows: confiar CA del sistema vía EXTRA_CA_CERTS (ver scripts/export-windows-certs.ps1)
applyTlsConfiguration();

/**
 * ===========================================
 * MODO DESARROLLO - BANNER
 * ===========================================
 */
if (process.env.NODE_ENV === 'development') {
  const COLORS = {
    CYAN: '\x1b[36m',
    YELLOW: '\x1b[33m',
    MAGENTA: '\x1b[35m',
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
  };

  console.log('');
  console.log(COLORS.CYAN + COLORS.BRIGHT + '  ██████╗ ██╗      ██████╗ ██╗    ██╗' + COLORS.RESET);
  console.log(COLORS.CYAN + COLORS.BRIGHT + ' ██╔════╝ ██║     ██╔═══██╗██║    ██║' + COLORS.RESET);
  console.log(COLORS.YELLOW + COLORS.BRIGHT + ' ██║  ███╗██║     ██║   ██║██║ █╗ ██║' + COLORS.RESET);
  console.log(COLORS.YELLOW + COLORS.BRIGHT + ' ██║   ██║██║     ██║   ██║██║███╗██║' + COLORS.RESET);
  console.log(COLORS.MAGENTA + COLORS.BRIGHT + ' ╚██████╔╝███████╗╚██████╔╝╚███╔███╔╝' + COLORS.RESET);
  console.log(COLORS.MAGENTA + COLORS.BRIGHT + '  ╚═════╝ ╚══════╝ ╚═════╝  ╚══╝╚══╝ ' + COLORS.RESET);
  console.log('');
  console.log(COLORS.YELLOW + '  🔧 MODO DESARROLLO ACTIVADO 🔧' + COLORS.RESET);
  console.log(COLORS.CYAN + '  Base de datos: MONGO_URI_DEV' + COLORS.RESET);
  console.log(COLORS.CYAN + '  FN background: ver apps/bots/glow/.env (EPIC_* flags)' + COLORS.RESET);
  console.log('');
}

/**
 * ===========================================
 * CONFIGURACIÓN DE INTENTS
 * ===========================================
 * Valor: 3276799 (mismo que el bot original)
 * Incluye los intents necesarios para el funcionamiento completo
 */
const INTENTS = 3276799;

/**
 * ===========================================
 * CONFIGURACIÓN DE CACHÉ OPTIMIZADA
 * ===========================================
 * Limitar caché reduce drásticamente el uso de RAM
 */
const CACHE_OPTIONS = Options.cacheWithLimits({
  // Limitar mensajes en caché (0 = deshabilitar)
  MessageManager: 0,
  
  // Limitar miembros en caché
  GuildMemberManager: {
    maxSize: 50,
    keepOverLimit: (member) => member.id === member.client.user?.id,
  },
  
  // Limitar usuarios en caché
  UserManager: {
    maxSize: 100,
    keepOverLimit: (user) => user.id === user.client.user?.id,
  },
  
  // Limitar presencias (usualmente no necesarias)
  PresenceManager: 0,
  
  // Threads
  ThreadManager: {
    maxSize: 10,
  },
  
  // Limitar reacciones
  ReactionManager: 0,
  ReactionUserManager: 0,
  
  // Limitar emojis cacheados
  GuildEmojiManager: {
    maxSize: 50,
  },
  
  // Limitar stickers
  GuildStickerManager: 0,
  
  // Limitar invitaciones
  GuildInviteManager: 0,
  
  // Limitar scheduled events
  GuildScheduledEventManager: 0,
  
  // Limitar voice states
  VoiceStateManager: 0,
});

/**
 * ===========================================
 * SWEEPER CONFIGURATION
 * ===========================================
 * Limpia caché automáticamente para liberar memoria
 */
const SWEEPER_OPTIONS = {
  messages: {
    interval: 300,    // Cada 5 minutos
    lifetime: 600,    // Mensajes > 10 minutos
  },
  users: {
    interval: 600,    // Cada 10 minutos
    filter: () => (user: any) => user.id !== user.client.user?.id,
  },
  guildMembers: {
    interval: 600,
    filter: () => (member: any) => member.id !== member.client.user?.id,
  },
  threads: {
    interval: 600,
    lifetime: 1800,   // Threads > 30 minutos
  },
};

/**
 * ===========================================
 * CREAR CLIENTE OPTIMIZADO
 * ===========================================
 */
const client = new Client({
  intents: INTENTS,
  
  // Aplicar límites de caché
  makeCache: CACHE_OPTIONS,
  
  // Sweepers para limpieza automática
  sweepers: SWEEPER_OPTIONS,
  
  // Partials para mejor manejo de eventos
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
  
  // Menciones permitidas
  allowedMentions: {
    parse: ['users', 'roles'],
    repliedUser: true,
  },
  
  // Configuración de rate limits
  failIfNotExists: false,
}) as ExtendedClient;

// Inicializar colecciones
client.commands = new Collection<string, Command>();
client.cooldowns = new Collection();
client.commandSessions = new Map();
client.activeGiveaways = new Map();

// Configurar número máximo de listeners (evita advertencias en desarrollo)
client.setMaxListeners(64);

/**
 * ===========================================
 * MANEJO DE ERRORES GLOBAL
 * ===========================================
 * Capturar errores sin llenar memoria con logs
 */
process.on('uncaughtException', (error) => {
  log.bot.error({ err: error }, 'Uncaught Exception');
});

process.on('unhandledRejection', (reason) => {
  log.bot.error({ err: reason }, 'Unhandled Rejection');
});

/**
 * ===========================================
 * GRACEFUL SHUTDOWN
 * ===========================================
 * Cerrar limpiamente para liberar recursos
 */
async function gracefulShutdown(signal: string): Promise<void> {
  log.bot.info({ signal }, 'Cerrando bot...');
  
  try {
    // Cerrar API interna de logros
    try {
      const { stopAchievementsApi } = await import('./api/achievementsApi.ts');
      stopAchievementsApi();
    } catch {
      // Ignorar: shutdown best-effort
    }
    
    // Limpiar colecciones
    client.commands.clear();
    client.cooldowns.clear();
    client.commandSessions?.clear();
    client.activeGiveaways?.clear();
    
    // Destruir cliente
    client.destroy();
    
    log.bot.info('Bot cerrado correctamente');
    process.exit(0);
  } catch (err) {
    log.bot.error({ err }, 'Error durante shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

/**
 * ===========================================
 * INICIAR BOT
 * ===========================================
 */
async function start(): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';
  const token = isDev ? process.env.DISCORD_TOKEN : process.env.DISCORD_TOKEN_PROD;
  
  if (!token) {
    log.bot.error(`${isDev ? 'DISCORD_TOKEN' : 'DISCORD_TOKEN_PROD'} no encontrado en variables de entorno (NODE_ENV=${process.env.NODE_ENV})`);
    process.exit(1);
  }

  log.bot.info({
    env: process.env.NODE_ENV,
    mode: isDev ? 'DEV' : 'PROD',
    tokenType: isDev ? 'DISCORD_TOKEN' : 'DISCORD_TOKEN_PROD',
    tokenPrefix: `${token.slice(0, 10)}...`,
  }, `[AUTH] Iniciando sesión en Discord (${isDev ? 'DESARROLLO' : 'PRODUCCIÓN'})`);
  
  try {
    // Inicializar MongoDB antes de cargar eventos
    const { initMongoDB } = await import('./events/db/mongodb.ts');
    await initMongoDB(client);
    
    // Cargar eventos (incluye ready)
    await loadEvents(client);

    // Token refresh needs a client to DM users when Epic definitively revokes an account
    const { registerTokenFailureClient } = await import('#helpers/epic/automation/tokenFailurePolicy.ts');
    registerTokenFailureClient(client);

    // Login
    await client.login(token);
    
    // Esperar a que el cliente esté listo antes de cargar comandos
    await waitForReady(client);

    const { loadPremiumCheckState } = await import('./helpers/core/client/premium.ts');
    await loadPremiumCheckState();

    // Cargar comandos
    await loadCommands(client);
    
    // API interna de logros (consumida por WebPlatform vía HTTP)
    try {
      const { startAchievementsApi } = await import('./api/achievementsApi.ts');
      startAchievementsApi(client);
    } catch (err) {
      log.bot.error({ err }, 'Error iniciando Achievements API (el bot sigue funcionando)');
    }
    
  } catch (err) {
    log.bot.error({ err }, 'Error iniciando bot');
    process.exit(1);
  }
}

/**
 * Espera a que el cliente esté listo
 */
function waitForReady(client: ExtendedClient, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (client.isReady()) {
      resolve();
      return;
    }
    
    const timer = setTimeout(() => {
      reject(new Error('Timeout esperando ready'));
    }, timeout);
    
    (client as any).once('clientReady', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Iniciar
start();

// Exportar cliente para uso externo si es necesario
export { client };
export type { ExtendedClient };
