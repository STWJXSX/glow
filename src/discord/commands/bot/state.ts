import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import { createEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, getTranslations } from '#helpers/locales/index.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { refreshDeviceAuthJson } from '#helpers/epic/auth/tokenRefresh.ts';
import { log } from '#helpers/core/logger.ts';

interface LightswitchStatus {
  status: string;
  message: string;
  banned: boolean;
}

interface EpicStatusData {
  status: {
    indicator: string;
    description: string;
  };
}

interface Component {
  id: string;
  name: string;
  status: string;
  description?: string;
}

interface ComponentsData {
  components: Component[];
}

interface Incident {
  id: string;
  name: string;
  status: string;
  impact: string;
  created_at: string;
  updated_at: string;
  shortlink: string;
}

interface IncidentsData {
  incidents: Incident[];
}

interface ServiceStatus {
  name: string;
  status: string;
  description: string;
}

interface ProcessedData {
  services: ServiceStatus[];
  overallStatus: string;
  activeIncidents: Incident[];
}

/**
 * Mapea estados a formato interno
 */
function mapStatusToInternal(status: string): string {
  const statusMap: Record<string, string> = {
    'UP': 'operational',
    'operational': 'operational',
    'degraded_performance': 'degraded',
    'partial_outage': 'partial_outage',
    'major_outage': 'major_outage',
    'maintenance': 'maintenance',
    'under_maintenance': 'maintenance',
    'none': 'operational',
    'minor': 'degraded',
    'major': 'partial_outage',
    'critical': 'major_outage'
  };
  
  return statusMap[status] || 'operational';
}

/**
 * Verifica si un componente es relacionado con Fortnite
 */
function isFortniteRelated(componentName: string): boolean {
  const fortniteKeywords = [
    'fortnite', 'battle', 'creative', 'save the world', 'game services',
    'matchmaking', 'social', 'item shop', 'stats', 'friends', 'party',
    'website', 'login', 'voice chat', 'leaderboards', 'crew', 'store',
    'authentication', 'voice', 'messaging', 'parties', 'lego', 'festival',
    'wallet', 'migration', 'epic online'
  ];
  
  const epicServicesKeywords = ['epic', 'launcher', 'account', 'oauth', 'platform'];
  
  const name = componentName.toLowerCase();
  return fortniteKeywords.some(keyword => name.includes(keyword)) || 
         epicServicesKeywords.some(keyword => name.includes(keyword));
}

/**
 * Normaliza nombres de servicios
 */
function normalizeServiceName(serviceName: string, trans: any): string {
  const normalizedName = serviceName.toLowerCase();
  
  // Mapeo directo de servicios conocidos
  const directMapping: Record<string, string> = {
    'fortnite game services': trans.state?.services?.gameServices?.() || 'Game Services',
    'fortnite login': trans.state?.services?.connection?.() || 'Login & Connection',
    'fortnite matchmaking': trans.state?.services?.matchmaking?.() || 'Matchmaking',
    'fortnite social features': trans.state?.services?.social?.() || 'Social Features',
    'fortnite item shop': trans.state?.services?.itemShop?.() || 'Item Shop',
    'fortnite stats': trans.state?.services?.stats?.() || 'Stats & Leaderboards',
    'fortnite party': trans.state?.services?.voiceChat?.() || 'Voice Chat & Party',
    'fortnite crew': trans.state?.services?.fortniteClub?.() || 'Fortnite Crew',
    'fortnite voice chat': trans.state?.services?.voiceChat?.() || 'Voice Chat',
    'fortnite website': trans.state?.services?.website?.() || 'Website',
    'fortnite leaderboards': trans.state?.services?.stats?.() || 'Stats & Leaderboards',
    'fortnite store': trans.state?.services?.itemShop?.() || 'Item Shop',
    'fortnite festival': trans.state?.services?.festival?.() || 'Fortnite Festival',
    'epic games store': trans.state?.services?.itemShop?.() || 'Epic Store',
    'epic games launcher': trans.state?.services?.website?.() || 'Epic Launcher',
    'epic games website': trans.state?.services?.website?.() || 'Epic Website',
    'epic games login': trans.state?.services?.connection?.() || 'Login',
    'epic games authentication': trans.state?.services?.connection?.() || 'Authentication',
    'epic games account services': trans.state?.services?.connection?.() || 'Account Services',
    'epic games platform services': trans.state?.services?.gameServices?.() || 'Platform Services',
    'epic online services': trans.state?.services?.epicServices?.() || 'Epic Online Services',
    'website': trans.state?.services?.website?.() || 'Website',
    'game services': trans.state?.services?.gameServices?.() || 'Game Services',
    'matchmaking': trans.state?.services?.matchmaking?.() || 'Matchmaking',
    'social': trans.state?.services?.social?.() || 'Social Features',
    'friends': trans.state?.services?.social?.() || 'Friends',
    'parties': trans.state?.services?.social?.() || 'Parties',
    'messaging': trans.state?.services?.social?.() || 'Messaging',
    'parties, friends, and messaging': trans.state?.services?.social?.() || 'Social Features',
    'item shop': trans.state?.services?.itemShop?.() || 'Item Shop',
    'stats': trans.state?.services?.stats?.() || 'Stats',
    'leaderboards': trans.state?.services?.stats?.() || 'Leaderboards',
    'stats and leaderboards': trans.state?.services?.stats?.() || 'Stats & Leaderboards',
    'authentication': trans.state?.services?.connection?.() || 'Authentication',
    'login': trans.state?.services?.connection?.() || 'Login',
    'voice': trans.state?.services?.voiceChat?.() || 'Voice Chat',
    'voice chat': trans.state?.services?.voiceChat?.() || 'Voice Chat',
    'social overlay': trans.state?.services?.voiceChat?.() || 'Social Overlay',
    'crew': trans.state?.services?.fortniteClub?.() || 'Crew',
    'lego fortnite': trans.state?.services?.lego?.() || 'LEGO Fortnite',
    'lego': trans.state?.services?.lego?.() || 'LEGO',
    'migration': trans.state?.services?.migration?.() || 'Account Migration',
    'account migration': trans.state?.services?.migration?.() || 'Account Migration',
    'epic wallet': trans.state?.services?.epicWallet?.() || 'Epic Wallet',
    'wallet': trans.state?.services?.epicWallet?.() || 'Wallet',
    'store browsing': trans.state?.services?.storeBrowsing?.() || 'Store Browsing',
    'store': trans.state?.services?.storeBrowsing?.() || 'Store',
    'festival': trans.state?.services?.festival?.() || 'Festival'
  };
  
  // Buscar mapeo directo
  if (directMapping[normalizedName]) {
    return directMapping[normalizedName];
  }
  
  // Buscar por inclusión de palabras clave
  for (const [key, value] of Object.entries(directMapping)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return value;
    }
  }
  
  return serviceName.charAt(0).toUpperCase() + serviceName.slice(1).toLowerCase();
}

/**
 * Obtiene descripción del estado
 */
const STATUS_KEY_MAP: Record<string, string> = {
  operational: 'operational',
  degraded: 'degraded',
  partial_outage: 'partialOutage',
  major_outage: 'majorOutage',
  maintenance: 'maintenance',
};

function getServiceDescription(status: string, trans: any): string {
  const key = STATUS_KEY_MAP[status] ?? 'operational';
  return trans.state?.status?.descriptions?.[key]?.()
    ?? trans.state?.status?.descriptions?.operational?.()
    ?? 'All systems operational';
}

/**
 * Obtiene el texto del estado
 */
function getStatusText(status: string, trans: any): string {
  const key = STATUS_KEY_MAP[status] ?? 'unknown';
  return trans.state?.status?.[key]?.()
    ?? trans.state?.status?.unknown?.()
    ?? 'Unknown';
}

/**
 * Reclama permisos de Lightswitch (necesario para usar la API)
 */
async function claimLightswitchPermissions(accessToken: string): Promise<boolean> {
  try {
    const claimURL = `${Endpoints.INIT_GRANTACCESS}?profileId=athena`;
    await axios.post(claimURL, {}, {
      headers: {
        Authorization: `bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    return true;
  } catch (error: any) {
    // 400 o 409 significa que ya tiene permisos
    if (error.response?.status === 400 || error.response?.status === 409) {
      return true;
    }
    log.epic.warn({ error: error.message }, 'Failed to claim Lightswitch permissions');
    return false;
  }
}

/**
 * Obtiene el estado de Lightswitch
 */
async function getLightswitchStatus(accessToken: string): Promise<LightswitchStatus | null> {
  try {
    // Primero intentar reclamar permisos
    await claimLightswitchPermissions(accessToken);
    
    const response = await axios.get(Endpoints.LIGHTSWITCH_STATUS, {
      headers: {
        Authorization: `bearer ${accessToken}`,
      },
      timeout: 10000,
    });
    
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0];
    }
    
    return null;
  } catch (error: any) {
    log.epic.error({ error: error.message }, 'Failed to fetch Lightswitch status');
    return null;
  }
}

/**
 * Obtiene datos de Epic Status
 */
async function fetchEpicData<T>(endpoint: string, name: string): Promise<T | null> {
  try {
    const response = await axios.get(endpoint, { timeout: 10000 });
    return response.data as T;
  } catch (error: any) {
    log.epic.error({ error: error.message, endpoint }, `Failed to fetch ${name}`);
    return null;
  }
}

/**
 * Procesa todos los datos de estado
 */
function processServerData(
  lightswitchData: LightswitchStatus | null,
  epicStatus: EpicStatusData | null,
  epicComponents: ComponentsData | null,
  incidents: IncidentsData | null,
  trans: any
): ProcessedData {
  const servicesMap = new Map<string, ServiceStatus>();
  let overallStatus = 'operational';
  const activeIncidents: Incident[] = [];
  
  // Procesar Lightswitch (prioridad más alta)
  if (lightswitchData) {
    const status = lightswitchData.status === 'UP' ? 'operational' : 'major_outage';
    const description = lightswitchData.message || getServiceDescription(status, trans);
    
    servicesMap.set('Game Services', {
      name: trans.state?.services?.gameServices?.() || 'Game Services',
      status,
      description
    });
    
    if (status !== 'operational') {
      overallStatus = status;
    }
  }
  
  // Procesar componentes de Epic Games
  if (epicComponents?.components) {
    for (const component of epicComponents.components) {
      if (!isFortniteRelated(component.name)) continue;
      
      const normalizedName = normalizeServiceName(component.name, trans);
      const status = mapStatusToInternal(component.status);
      
      // Actualizar solo si no existe o si el nuevo estado es peor
      const existing = servicesMap.get(normalizedName);
      if (!existing || shouldUpdateStatus(existing.status, status)) {
        servicesMap.set(normalizedName, {
          name: normalizedName,
          status,
          description: component.description || getServiceDescription(status, trans)
        });
      }
      
      // Actualizar estado general
      if (status !== 'operational') {
        overallStatus = getWorstStatus(overallStatus, status);
      }
    }
  }
  
  // Si no hay suficientes servicios, añadir servicios base
  if (servicesMap.size < 3) {
    const baseServices = [
      { key: 'website', name: trans.state?.services?.website?.() || 'Website' },
      { key: 'gameServices', name: trans.state?.services?.gameServices?.() || 'Game Services' },
      { key: 'connection', name: trans.state?.services?.connection?.() || 'Connection' },
      { key: 'social', name: trans.state?.services?.social?.() || 'Game, friends, messages' },
      { key: 'voiceChat', name: trans.state?.services?.voiceChat?.() || 'Voice Chat' },
      { key: 'matchmaking', name: trans.state?.services?.matchmaking?.() || 'Matchmaking' },
      { key: 'stats', name: trans.state?.services?.stats?.() || 'Stats and leaderboards' },
      { key: 'itemShop', name: trans.state?.services?.itemShop?.() || 'Item Shop' }
    ];
    
    for (const service of baseServices) {
      if (!servicesMap.has(service.name)) {
        servicesMap.set(service.name, {
          name: service.name,
          status: 'operational',
          description: getServiceDescription('operational', trans)
        });
      }
    }
  }
  
  // Procesar incidentes activos
  if (incidents?.incidents) {
    for (const incident of incidents.incidents) {
      if (incident.status !== 'resolved') {
        activeIncidents.push(incident);
        const status = mapStatusToInternal(incident.impact);
        overallStatus = getWorstStatus(overallStatus, status);
      }
    }
  }
  
  // Procesar estado general de Epic
  if (epicStatus?.status) {
    const generalStatus = mapStatusToInternal(epicStatus.status.indicator);
    if (generalStatus !== 'operational') {
      overallStatus = getWorstStatus(overallStatus, generalStatus);
    }
  }
  
  return {
    services: Array.from(servicesMap.values()),
    overallStatus,
    activeIncidents: activeIncidents.slice(0, 3)
  };
}

/**
 * Determina si se debe actualizar el estado
 */
function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const priority: Record<string, number> = {
    'operational': 0,
    'degraded': 1,
    'maintenance': 2,
    'partial_outage': 3,
    'major_outage': 4
  };
  
  return (priority[newStatus] || 0) > (priority[currentStatus] || 0);
}

/**
 * Obtiene el peor estado entre dos
 */
function getWorstStatus(status1: string, status2: string): string {
  return shouldUpdateStatus(status1, status2) ? status2 : status1;
}

export const data = new SlashCommandBuilder()
  .setName('state')
  .setDescription('Commands related to service status')
  .setNameLocalizations(buildDiscordLocalizations('state.cmd.name'))
  .setDescriptionLocalizations(buildDiscordLocalizations('state.cmd._1'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('fortnite')
      .setDescription('Check current Fortnite server status')
      .setNameLocalizations(buildDiscordLocalizations('state.cmd.fortnite.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('state.cmd.fortnite._1'))
  )
  .setDMPermission(true);

export async function execute(interaction: ChatInputCommandInteraction) {
  const trans = await getTranslations(interaction);
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'fortnite') {
    await handleFortniteStatus(interaction, trans);
  }
}

async function handleFortniteStatus(interaction: ChatInputCommandInteraction, trans: any) {
  const emojiloading = getEmoji(interaction.client, 'loading');
  const emojifortnite = getEmoji(interaction.client, 'epic');
  
  try {
    // Mensaje de carga inicial
    const loadingEmbed = await createEmbed({
      style: 'info',
      description: (trans.state?.loading?.() || `${emojiloading} Checking server status...`).replace('{emoji}', emojiloading),
      footer: 'user',
      interaction
    });
    
    // Check if interaction was already replied to or deferred
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [loadingEmbed] });
    } else {
      await interaction.reply({ embeds: [loadingEmbed] });
    }
    
    // Obtener token de deviceAuth.json
    const deviceAuth = await refreshDeviceAuthJson();
    let lightswitchData: LightswitchStatus | null = null;
    
    if (deviceAuth?.accessToken) {
      lightswitchData = await getLightswitchStatus(deviceAuth.accessToken);
    } else {
      log.epic.warn('No valid token for Lightswitch API');
    }
    
    // Obtener datos de Epic Status (no requieren autenticación)
    const [epicStatus, epicComponents, incidents] = await Promise.all([
      fetchEpicData<EpicStatusData>(Endpoints.EPIC_STATUS_PAGE, 'Epic Status'),
      fetchEpicData<ComponentsData>(Endpoints.EPIC_COMPONENTS, 'Epic Components'),
      fetchEpicData<IncidentsData>(Endpoints.EPIC_INCIDENTS, 'Epic Incidents')
    ]);
    
    // Procesar datos
    const { services, overallStatus, activeIncidents } = processServerData(
      lightswitchData,
      epicStatus,
      epicComponents,
      incidents,
      trans
    );
    
    // Obtener emoji del estado general
    const statusEmojiName = overallStatus as keyof typeof import('#helpers/core/emojis.ts').EMOJI_IDS;
    const statusEmoji = getEmoji(interaction.client, statusEmojiName);
    const statusText = getStatusText(overallStatus, trans);
    
    // Construir descripción general
    let description = `**${trans.state?.labels?.overallStatus?.() || 'Overall Status'}:** ${statusText}`;
    if (epicStatus?.status?.description) {
      description += `\n> ${epicStatus.status.description}`;
    }
    
    // Crear campos del embed - un field por cada servicio
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];
    
    // Añadir cada servicio como un field individual
    for (const service of services) {
      const emoji = getEmoji(interaction.client, service.status as any);
      const fieldValue = `> ${service.description}`;
      
      fields.push({
        name: `${emoji} ${service.name}`,
        value: fieldValue.length > 1024 ? fieldValue.substring(0, 1020) + '...' : fieldValue,
        inline: false
      });
    }
    
    // Construir hoja de ruta (roadmap)
    const roadmapItems = [
      { status: 'operational', label: trans.state?.roadmap?.operational?.() || 'Operational' },
      { status: 'degraded', label: trans.state?.roadmap?.degraded?.() || 'Degraded Performance' },
      { status: 'partial_outage', label: trans.state?.roadmap?.partialOutage?.() || 'Partial Outage' },
      { status: 'major_outage', label: trans.state?.roadmap?.majorOutage?.() || 'Major Outage' },
      { status: 'maintenance', label: trans.state?.roadmap?.maintenance?.() || 'Under Maintenance' },
    ];
    
    const roadmapText = roadmapItems
      .map(item => {
        const emoji = getEmoji(interaction.client, item.status as any);
        const desc = getServiceDescription(item.status, trans);
        return `${emoji} _${item.label}_\n> ${desc}`;
      })
      .join('\n\n');
    
    // Limitar roadmap si excede el límite
    const finalRoadmapText = roadmapText.length > 1024
      ? roadmapText.substring(0, 1020) + '...'
      : roadmapText;
    
    // Añadir roadmap
    fields.push({
      name: trans.state?.embed?.fields?.roadmap?.() || '🗺️ Roadmap',
      value: finalRoadmapText,
      inline: true
    });
    
    // Construir y añadir incidentes activos
    if (activeIncidents.length > 0) {
      const incidentsText = activeIncidents
        .map(incident => {
          const emoji = getEmoji(interaction.client, mapStatusToInternal(incident.impact) as any);
          const dateLocales: Record<string, string> = {
            es: 'es-ES', 'es-419': 'es-419', de: 'de-DE', fr: 'fr-FR', it: 'it-IT',
            'pt-BR': 'pt-BR', pl: 'pl-PL', ru: 'ru-RU', tr: 'tr-TR', ja: 'ja-JP',
            ko: 'ko-KR', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', id: 'id-ID', vi: 'vi-VN',
            th: 'th-TH', ar: 'ar-SA',
          };
          const createdDate = new Date(incident.created_at).toLocaleString(dateLocales[trans._language] ?? 'en-US');
          return `${emoji} **${incident.name}**\n> ${trans.state?.labels?.status?.() || 'Status'}: ${incident.status}\n> ${trans.state?.labels?.created?.() || 'Created'}: ${createdDate}`;
        })
        .join('\n\n');
      
      const finalIncidentsText = incidentsText.length > 1024 
        ? incidentsText.substring(0, 1020) + '...' 
        : incidentsText;
      
      fields.push({
        name: trans.state?.embed?.fields?.activeIncidents?.() || '🚨 Active Incidents',
        value: finalIncidentsText,
        inline: false
      });
    }
    
    const embed = await createEmbed({
      style: overallStatus === 'operational' ? 'success' : overallStatus === 'major_outage' ? 'error' : 'warning',
      title: `${emojifortnite} ${trans.state?.serverTitle?.() || trans.state?.embed?.title?.()?.replace('{emoji}', '')?.trim() || 'Fortnite Server Status'}`,
      description,
      fields,
      footer: 'user',
      timestamp: true,
      interaction
    });
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error: any) {
    log.epic.error({ error: error.message, stack: error.stack }, 'Error in state command');
    
    const errorEmbed = await createEmbed({
      style: 'error',
      title: trans.state?.error?.title?.() || `${getEmoji(interaction.client, 'error')} Error`,
      description: trans.state?.error?.description?.() || 'Failed to fetch server status. Please try again later.',
      footer: 'user',
      interaction
    });
    
    try {
      await interaction.editReply({ embeds: [errorEmbed] });
    } catch (replyError: any) {
      log.epic.error({ error: replyError.message }, 'Failed to send error message');
    }
  }
}

export const auth = false;
export const stw = false;
