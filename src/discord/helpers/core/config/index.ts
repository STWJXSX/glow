/**
 * Configuración central del bot
 */

export const BOT_CONFIG = {
  /**
   * Prefijos permitidos para comandos de texto (legacy)
   * El bot responderá a mensajes que empiecen con cualquiera de estos prefijos
   */
  PREFIXES: ['g', 'G'],

  /**
   * Prefijo principal (usado para mostrar en ayuda)
   */
  PRIMARY_PREFIX: 'g',

  /**
   * Colores para embeds (en hexadecimal)
   */
  COLORS: {
    SUCCESS: 0x00ff00,    // Verde
    ERROR: 0xff0000,      // Rojo
    WARNING: 0xffa500,    // Naranja
    INFO: 0x0099ff,       // Azul
    PRIMARY: 0x5865f2,    // Blurple de Discord
    PREMIUM: 0xffd700,    // Dorado
  },

  /**
   * Emojis personalizados del bot
   */
  EMOJIS: {
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    PREMIUM: '⭐',
    LOCK: '🔒',
    UNLOCK: '🔓',
  },

  /**
   * IDs de bots para verificación de premium
   */
  BOT_IDS: {
    CATBOTFN: '1087063032794710076',
    CATBOT: '1087063032794710075', // Ajustar según tu bot
  },

  /**
   * Configuración de cooldowns
   */
  COOLDOWNS: {
    DEFAULT: 3000,        // 3 segundos
    PREMIUM: 1000,        // 1 segundo para usuarios premium
    ADMIN: 0,             // Sin cooldown para admins
  },

  /**
   * Límites de caché
   */
  CACHE_LIMITS: {
    BLACKLIST_DURATION: 5 * 60 * 1000,      // 5 minutos
    LANGUAGE_DURATION: 30 * 60 * 1000,      // 30 minutos
    PREMIUM_DURATION: 10 * 60 * 1000,       // 10 minutos
  },

  /**
   * Enlaces importantes
   */
  LINKS: {
    SUPPORT: 'https://discord.gg/tR7XTnRnrD',
    INVITE: 'https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=8&scope=bot%20applications.commands',
    WEBSITE: 'https://your-website.com',
    TERMS: 'https://your-website.com/terms',
    PRIVACY: 'https://your-website.com/privacy',
  },

  /**
   * Configuración de MongoDB
   */
  MONGODB: {
    MAX_POOL_SIZE: 10,
    MIN_POOL_SIZE: 2,
    SERVER_SELECTION_TIMEOUT: 5000,
    SOCKET_TIMEOUT: 45000,
  },
} as const;

/**
 * Verificar si un mensaje empieza con alguno de los prefijos configurados
 */
export function hasPrefix(content: string): { hasPrefix: boolean; prefix: string; command: string } {
  const lowerContent = content.toLowerCase();
  
  for (const prefix of BOT_CONFIG.PREFIXES) {
    if (lowerContent.startsWith(prefix.toLowerCase())) {
      return {
        hasPrefix: true,
        prefix,
        command: content.slice(prefix.length).trim(),
      };
    }
  }

  return {
    hasPrefix: false,
    prefix: '',
    command: '',
  };
}

export default BOT_CONFIG;

export {
  epicBackgroundConfig,
  classifyEpicEventPath,
  isEpicBackgroundEventEnabled,
  logEpicBackgroundBootSummary,
} from './epicBackground.ts';
