import {
  Client,
  Collection,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  AutocompleteInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import type { ShopPage } from '../managers/epic/shop/types.ts';

/**
 * Tipos centralizados para el bot
 * Mantener tipos mínimos y reutilizables
 */

// Extensión del cliente de Discord (basado en el bot original)
export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
  cooldowns: Collection<string, Collection<string, number>>;
  
  // Extensiones del bot original
  mongo?: any; // Mongoose connection
  activeGiveaways?: Map<string, any>;
  maintenance?: { active: boolean; reason: string } | null;
  
  // Sistema de sesiones para comandos (ej: dupe en proceso)
  commandSessions?: Map<string, {
    commandName: string;
    userId: string;
    messageUrl: string;
    startTime: number;
  }>;
  
  // Sistema de cache de tienda
  getStoreCache?: (
    language?: 'es' | 'en',
    variant?: import('../managers/epic/shop/types.ts').ShopImageVariant,
  ) => Promise<{
    fullSectioned: ShopPage;
    page: ShopPage;
  } | null>;
  readStoreCache?: (
    language?: 'es' | 'en',
    variant?: import('../managers/epic/shop/types.ts').ShopImageVariant,
  ) => Promise<{
    fullSectioned: ShopPage;
    page: ShopPage;
  } | null>;
  forceRegenerateStoreCache?: () => Promise<boolean>;
  getStoreCacheStats?: () => any;
}

// Estructura de comando optimizada
export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder | ContextMenuCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  
  // Función principal del comando
  execute: (interaction: ChatInputCommandInteraction) => Promise<void> | void;
  
  // Autocompletado opcional
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void> | void;
  
  // Cooldown en segundos (opcional, default: 3)
  cooldown?: number;
  
  // Solo para desarrolladores
  devOnly?: boolean;

  // Con devOnly: también lo pueden usar los gestores de blacklist (sin acceso al resto de herramientas dev)
  devAccess?: 'blacklist';
  
  // Permisos requeridos del usuario
  userPermissions?: bigint[];
  
  // Permisos requeridos del bot
  botPermissions?: bigint[];
  
  // ===== SISTEMA DE AUTENTICACIÓN =====
  // Requiere que el usuario haya aceptado TOS
  auth?: boolean;
  
  // ===== SISTEMA DE SERVIDOR REQUERIDO =====
  // Requiere que el usuario esté en el servidor de soporte
  inServer?: boolean;
  
  // ===== SISTEMA DE PREMIUM =====
  // Any premium (booster or paid)
  prem?: boolean;
  // Paid Glow Premium (boosters excluded)
  premPaid?: boolean;
  // @deprecated aliases for premPaid
  premPro?: boolean;
  premMonthly?: boolean;
  premUltimate?: boolean;
  premYearly?: boolean;
  premImmortal?: boolean;
  // Booster-only check (paid tier also passes)
  premBooster?: boolean;

  /** Automation system this command configures — tier gate read from automation/config.ts */
  automationSystem?: import('../helpers/epic/automation/autoconfigStatus.ts').AutoconfigPanelKey;
  
  // ===== OPCIONES DE RESPUESTA =====
  // No diferir la respuesta (responder automáticamente con loading)
  nodefer?: boolean;
  // Diferir la respuesta como ephemeral (solo visible para el ejecutor)
  deferEphemeral?: boolean;
  
  // ===== SISTEMA DE PREFIJOS =====
  // Solo permitir uso con slash commands (no con prefijos de texto)
  onlyslash?: boolean;
}

// Estructura de evento optimizada
export interface BotEvent<T extends keyof ClientEvents = keyof ClientEvents> {
  name: T;
  once?: boolean;
  execute: (client: ExtendedClient, ...args: ClientEvents[T]) => Promise<void> | void;
}

// Importar tipos de eventos de discord.js
import type { ClientEvents } from 'discord.js';

// Re-exportar para conveniencia
export type { ClientEvents };
