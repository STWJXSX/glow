/**
 * Todos los endpoints de la API de Epic Games
 */

export const Endpoints = Object.freeze({
  // MATCHMAKING
  MATCHMAKING: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer",
  MATCHMAKING_PARTY: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer",

  // PARTY
  PARTY_LEAVE: "https://party-service-prod.ol.epicgames.com/party/api/v1/Fortnite/parties",
  PARTY_PING_RESOURCE: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/matchmakingservice/ticket/player",
  

  //BASE
  FORTNITE_API:"https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/",


  // AUTH
  ACCOUNT_DEVICEAUTH_LIST: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  ACCOUNT_DEVICEAUTH_DELETE: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  ACCOUNT_PUBLIC: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  USER_SEARCH: "https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/br/account",
  LOGIN_REPUTATION: "https://www.epicgames.com/id/api/reputation",
  LOGIN_CSRF: "https://www.epicgames.com/id/api/csrf",
  LOGIN: "https://www.epicgames.com/id/api/login",
  LOGIN_EXCHANGE: "https://www.epicgames.com/id/api/exchange",
  OAUTH_TOKEN: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token",
  OAUTH_TOKEN_CREATE: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token",
  OAUTH_TOKEN_VERIFY: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/verify",
  OAUTH_TOKEN_KILL: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/sessions/kill",
  OAUTH_TOKEN_KILL_MULTIPLE: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/sessions/kill",
  OAUTH_EXCHANGE: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange",
  OAUTH_DEVICE_AUTH: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  OAUTH_DEVICE_CODE: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/deviceAuthorization",

  // INITIAL SETUP
  INIT_EULA: "https://eulatracking-public-service-prod-m.ol.epicgames.com/eulatracking/api/public/agreements/fn",
  INIT_GRANTACCESS: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/grant_access",

  // XMPP
  XMPP_SERVER: "xmpp-service-prod.ol.epicgames.com",
  EPIC_PROD_ENV: "prod.ol.epicgames.com",

  // Presence (REST — no EOS SDK; uses XMPP connectionId)
  PRESENCE_SERVICE: "https://presence-public-service-prod.ol.epicgames.com",

  // EOS
  EOS_API: "https://api.epicgames.dev",
  EOS_STOMP: "connect.epicgames.dev",
  EOS_TOKEN: "https://api.epicgames.dev/epic/oauth/v2/token",
  EOS_TOKEN_INFO: "https://api.epicgames.dev/epic/oauth/v2/tokenInfo",
  EOS_TOKEN_REVOKE: "https://api.epicgames.dev/epic/oauth/v2/revoke",
  EOS_CHAT: "https://api.epicgames.dev/epic/chat",
  PUBLICKEY: "https://publickey-service-prod.ecbc.live.use1a.on.epicgames.com/publickey",

  // BATTLE ROYALE
  BR_STATS_V2: "https://statsproxy-public-service-live.ol.epicgames.com/statsproxy/api/statsv2",
  BR_SERVER_STATUS: "https://lightswitch-public-service-prod06.ol.epicgames.com/lightswitch/api/service/bulk/status?serviceId=Fortnite",
  BR_STORE: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/storefront/v2/catalog",
  BR_STORE_KEYCHAIN: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/storefront/v2/keychain?numKeysDownloaded=0",
  BR_NEWS: "https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game",
  BR_NEWS_MOTD: "https://prm-dialogue-public-api-prod.edea.live.use1a.on.epicgames.com/api/v1/fortnite-br/surfaces/motd/target",
  BR_EVENT_FLAGS: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/calendar/v1/timeline",
  BR_SAC_SEARCH: "https://payment-website-pci.ol.epicgames.com/affiliate/search-by-slug",
  BR_SAC: "https://affiliate-public-service-prod.ol.epicgames.com/affiliate/api/public/affiliates/slug",
  BR_PARTY: "https://party-service-prod.ol.epicgames.com/party/api/v1/Fortnite",
  BR_TOURNAMENTS: "https://events-public-service-live.ol.epicgames.com/api/v1/events/Fortnite/data",
  BR_TOURNAMENTS_DOWNLOAD: "https://events-public-service-live.ol.epicgames.com/api/v1/events/Fortnite/download",
  BR_TOURNAMENT_WINDOW: "https://events-public-service-live.ol.epicgames.com/api/v1/leaderboards/Fortnite",
  BR_TOURNAMENT_TOKENS: "https://events-public-service-live.ol.epicgames.com/api/v1/players/Fortnite/tokens",
  BR_STREAM: "https://fortnite-vod.akamaized.net",
  BR_REPLAY: "https://datastorage-public-service-live.ol.epicgames.com/api/v1/access/fnreplays/public",
  BR_REPLAY_METADATA: "https://datastorage-public-service-live.ol.epicgames.com/api/v1/access/fnreplaysmetadata/public",
  BR_GIFT_ELIGIBILITY: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/storefront/v2/gift/check_eligibility",

  // CREATIVE
  CREATIVE_ISLAND_LOOKUP: "https://links-public-service-live.ol.epicgames.com/links/api/fn/mnemonic",
  CREATIVE_DISCOVERY: "https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v1/discovery/surface",

  // SAVE THE WORLD
  STW_WORLD_INFO: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/world/info",
  STW_FRIENDCODES: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/friendcodes",
  STW_LINK_HISTORY: "https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v1/links/history",
  /** Alternate MCP host seen in MITM captures (mcp-gc.live.fngw). */
  MCP_GC_LIVE: "https://mcp-gc.live.fngw.ol.epicgames.com/fortnite/api",

  // ACCOUNT
  ACCOUNT_MULTIPLE: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  ACCOUNT_DISPLAYNAME: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName",
  ACCOUNT_ID: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  ACCOUNT_EMAIL: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account/email",
  ACCOUNT_SEARCH: "https://user-search-service-prod.ol.epicgames.com/api/v1/search",
  ACCOUNT_AVATAR: "https://avatar-service-prod.identity.live.on.epicgames.com/v1/avatar",
  ACCOUNT_GLOBAL_PROFILE: "https://global-profile-service.game-social.epicgames.com/profiles",
  MCP: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/profile",

  // FRIENDS
  FRIENDS: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_ADD: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_REMOVE: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_ACCEPTBULK: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_CLEARLIST: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_LIST: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_INCOMING: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_OUTGOING: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_SUGGESTED: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_SUMARY: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_ALIAS: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_REMOVEALIAS: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_BLOCK: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_CLEARBLOCK: "https://friends-public-service-prod.ol.epicgames.com/friends/api/public/blocklist",
  FRIEND_BLOCKLIST: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_UNBLOCK: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",
  FRIEND_MUTUAL: "https://friends-public-service-prod.ol.epicgames.com/friends/api/v1",

  // LIBRARY SERVICE (PLAYTIME)
  LIBRARY_PLAYTIME_GET: "https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account",
  LIBRARY_PLAYTIME_ADD: "https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account",
  LIBRARY_STATETOKEN: "https://library-service.live.use1a.on.epicgames.com/library/api/public/stateToken/stateToken/status",

  // SERVER STATUS
  SERVER_STATUS_SUMMARY: "https://ft308v428dv3.statuspage.io/api/v2/summary.json",
  EPIC_STATUS_PAGE: "https://status.epicgames.com/api/v2/status.json",
  EPIC_COMPONENTS: "https://status.epicgames.com/api/v2/components.json",
  EPIC_INCIDENTS: "https://status.epicgames.com/api/v2/incidents.json",

  // GRAPHQL
  GRAPHQL: "https://graphql.epicgames.com/graphql",

  ENTITLEMENTS: "https://entitlement-public-service-prod08.ol.epicgames.com/entitlement/api/account",
  ORDER_PURCHASE: "https://orderprocessor-public-service-ecomprod01.ol.epicgames.com/orderprocessor/api/shared/accounts",
  CAPTCHA_PURCHASE: "https://www.epicgames.com/store/purchase",

  // Launcher
  MANIFEST: "https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows/4fe75bbc5a674f4f9b356b5c90567da5/Fortnite?label=Live",
  LAUNCHER: "https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/",

  // Fortnite Public Service
  STAGING_API: "https://fortnite-public-service-stage.ol.epicgames.com/fortnite/api/version",
  PUBLIC_BASE_URL: "https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api",
  CLOUD_STORAGE: "https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/cloudstorage/system",
  CLOUD_STORAGE_USER: "https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/cloudstorage/user",

  // LIGHTSWITCH
  LIGHT_SWITCH: "https://lightswitch-public-service-prod06.ol.epicgames.com/lightswitch/api/service/bulk/status",
  LIGHTSWITCH_STATUS: "https://lightswitch-public-service-prod.ol.epicgames.com/lightswitch/api/service/fortnite/status",

  // LOOKUP
  LOOKUP_ACCOUNTID: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
  LOOKUP_DISPLAYNAME: "https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName",

  // Mia (third-party; requires MIA_API_KEY)
  MIA_API_V1: "https://api.miadsc.xyz/v1",
  MIA_FORTNITE_ADMIN_PANEL_CODES: "https://api.miadsc.xyz/v1/fortnite/admin-panel/codes",
});

// Export individual object for easier imports
export const endpoints = Endpoints;
