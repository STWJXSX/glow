import { log } from '../logger.ts';

type EpicBackgroundGroup =
  | 'sprites'
  | 'shop'
  | 'feeds'
  | 'presence'
  | 'chat'
  | 'automation';

function readEnvFlag(name: string, defaultEnabled = true): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultEnabled;
  const normalized = raw.trim().toLowerCase();
  return normalized !== '0'
    && normalized !== 'false'
    && normalized !== 'off'
    && normalized !== 'no';
}

function resolveFlag(name: string, defaultEnabled = true): boolean {
  if (!readEnvFlag('EPIC_BACKGROUND_ENABLED', true)) return false;
  return readEnvFlag(name, defaultEnabled);
}

export const epicBackgroundConfig = {
  /** Master kill switch for all FN background services (auto events + ready.ts inits). */
  get master(): boolean {
    return readEnvFlag('EPIC_BACKGROUND_ENABLED', true);
  },

  /** Auto-loaded BotEvents under events/epic/ (legacy name kept). */
  get events(): boolean {
    return resolveFlag('EPIC_EVENTS_ENABLED', true);
  },

  get autokick(): boolean {
    return resolveFlag('EPIC_AUTOKICK_ENABLED', true);
  },

  get taxis(): boolean {
    return resolveFlag('EPIC_TAXI_ENABLED', true) && readEnvFlag('TAXI_BOTS_ENABLED', true);
  },

  get taxiprem(): boolean {
    return resolveFlag('EPIC_TAXIPREM_ENABLED', true);
  },

  /** Fortnite in-game presence (StatusKeeper / XMPP pool). */
  get presence(): boolean {
    return resolveFlag('EPIC_PRESENCE_ENABLED', true);
  },

  /** Pak/sprite/cosmetics sync crons and boot exporters. */
  get sprites(): boolean {
    return resolveFlag('EPIC_SPRITE_SYNC_ENABLED', true);
  },

  /** Shop cache regeneration and shop JSON downloader. */
  get shop(): boolean {
    return resolveFlag('EPIC_SHOP_SYNC_ENABLED', true);
  },

  /** Discord FN feeds (daily, shop, status, worldinfo). */
  get feeds(): boolean {
    return resolveFlag('EPIC_FEEDS_ENABLED', true);
  },

  /** Scheduled user automations (auto daily, autobuy, autoloadout XMPP, etc.). */
  get automation(): boolean {
    return resolveFlag('EPIC_AUTOMATION_ENABLED', true);
  },

  /** Fortnite chat bot (XMPP + STOMP). */
  get chat(): boolean {
    return resolveFlag('FNCHAT_ENABLED', true);
  },
};

export function classifyEpicEventPath(filePath: string): EpicBackgroundGroup | 'interactive' | null {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (!normalized.includes('/events/epic/')) return null;

  if (normalized.includes('/loadouts/')) return 'interactive';

  if (
    normalized.includes('/sprites/')
    || normalized.includes('/cosmetics/cosmeticsdownloader')
  ) {
    return 'sprites';
  }

  if (normalized.includes('/shop/')) return 'shop';
  if (normalized.includes('/fn/feeds/')) return 'feeds';
  if (normalized.includes('/fn/status/')) return 'presence';
  if (normalized.includes('/fn/chat/')) return 'chat';
  if (normalized.includes('/automation/')) return 'automation';
  if (normalized.includes('/reminders/')) return 'automation';
  if (normalized.includes('/worldinfocachecleanup')) return 'feeds';

  return null;
}

export function isEpicBackgroundEventEnabled(filePath: string): boolean {
  const group = classifyEpicEventPath(filePath);
  if (group === 'interactive') return true;
  if (group === null) {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (!normalized.includes('/events/epic/')) return true;
    return epicBackgroundConfig.master && epicBackgroundConfig.events;
  }
  if (!epicBackgroundConfig.master || !epicBackgroundConfig.events) return false;

  switch (group) {
    case 'sprites':
      return epicBackgroundConfig.sprites;
    case 'shop':
      return epicBackgroundConfig.shop;
    case 'feeds':
      return epicBackgroundConfig.feeds;
    case 'presence':
      return epicBackgroundConfig.presence;
    case 'chat':
      return epicBackgroundConfig.chat;
    case 'automation':
      return epicBackgroundConfig.automation;
    default:
      return true;
  }
}

export function logEpicBackgroundBootSummary(): void {
  const flags = {
    master: epicBackgroundConfig.master,
    events: epicBackgroundConfig.events,
    autokick: epicBackgroundConfig.autokick,
    taxis: epicBackgroundConfig.taxis,
    taxiprem: epicBackgroundConfig.taxiprem,
    presence: epicBackgroundConfig.presence,
    sprites: epicBackgroundConfig.sprites,
    shop: epicBackgroundConfig.shop,
    feeds: epicBackgroundConfig.feeds,
    automation: epicBackgroundConfig.automation,
    chat: epicBackgroundConfig.chat,
  };

  const disabled = Object.entries(flags)
    .filter(([, enabled]) => !enabled)
    .map(([name]) => name);

  if (disabled.length === 0) {
    log.bot.info('[EpicBackground] All FN background services enabled');
    return;
  }

  log.bot.info({ disabled, flags }, '[EpicBackground] FN background services partially disabled');
}
