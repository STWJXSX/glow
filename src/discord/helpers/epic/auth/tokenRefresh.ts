/**
 * TOKEN REFRESH SYSTEM
 * Sistema de refresco automático de tokens de Epic Games
 * Verifica y refresca accessToken antes de ejecutar comandos
 * 
 * IMPORTANTE: Siempre intenta primero con ANDROID (cliente principal)
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import UsuarioInfo, { type IDeviceAuth, type IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { clearAutomationSuspensionOnDeviceAuth, handleRevokedAccount, purgeUnlinkedAccount } from '../automation/tokenFailurePolicy.ts';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { getFallbackServiceDevices } from './serviceAccountFallback.ts';

const DEVICE_AUTH_JSON_PATH = path.resolve((import.meta.dirname ?? __dirname), '../../data/deviceAuth.json');

export function resolveDeviceAuthJsonPath(customPath?: string): string {
  return customPath ?? DEVICE_AUTH_JSON_PATH;
}

const ANDROID_CLIENT_HEADER = 'M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';
const LAUNCHER_CLIENT_HEADER = 'OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3';

/**
 * Verifica si un accessToken es válido
 */
export async function verifyToken(
  accessToken: string,
  expiresAt: string | null = null,
  options: { remote?: boolean } = {},
): Promise<boolean> {
  if (!accessToken) return false;
  if (expiresAt && new Date(expiresAt) < new Date(Date.now() + 60000)) {
    return false;
  }
  // Known expiry still in the future: trust it locally — asking Epic on every
  // command added a full round trip before the bot could even answer Discord.
  // Pass { remote: true } where a real server-side check is wanted (diagnostics).
  if (expiresAt && !options.remote) {
    return true;
  }

  try {
    await axios.get(Endpoints.OAUTH_TOKEN_VERIFY, {
      headers: { Authorization: `bearer ${accessToken}` },
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Classifies an Axios/network error as a confirmed authentication failure (4xx auth)
 * or a transient network/server error (5xx, timeout, connection refused, etc.).
 * Returns true only if the server explicitly rejected the credentials.
 */
function classifyAxiosError(err: any): boolean {
  const status = err?.response?.status;
  return status === 400 || status === 401 || status === 403;
}

/**
 * The only Epic answer meaning a saved device auth is gone for good (deleted, password reset...).
 * Checked against Epic: every OAuth rejection is HTTP 400, so the status alone says nothing.
 * A bad bot client gives invalid_client_credentials, a malformed request invalid_request, and the
 * LAUNCHER client always gives unauthorized_client because it cannot use the device_auth grant.
 */
const REVOKED_DEVICE_AUTH_CODE = 'errors.com.epicgames.account.invalid_account_credentials';

/** Rejections caused by the bot's own client or request, never by the user's account. */
const BOT_SIDE_ERROR_CODES = new Set([
  'errors.com.epicgames.account.invalid_client_credentials',
  'errors.com.epicgames.common.oauth.unauthorized_client',
  'errors.com.epicgames.common.oauth.invalid_request',
]);

function epicErrorCode(err: any): string | undefined {
  return err?.response?.data?.errorCode;
}

/** Delay before re-checking a rejected device auth, so a one-off glitch at Epic cannot remove an account. */
const REVOCATION_RECHECK_DELAY_MS = 5000;

/**
 * Discriminated result from Epic OAuth calls.
 * success=true  → data contains the token response.
 * success=false → isAuthError=true means credentials are invalid; false means transient network/server issue.
 */
export type EpicTokenResult =
  | { success: true; data: any }
  | { success: false; isAuthError: boolean; /** ANDROID rejected the device auth as invalid_account_credentials */ revoked?: boolean };

/**
 * Intenta refrescar el token usando refreshToken
 * SIEMPRE intenta primero con ANDROID
 */
export async function verifyRefreshToken(refreshToken: string): Promise<EpicTokenResult> {
  let androidIsAuth = false;
  // PASO 1: Intentar con ANDROID (cliente principal)
  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT_HEADER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    });

    log.epic.debug('Token refreshed with ANDROID client');
    return { success: true, data: res.data };
  } catch (androidError: any) {
    androidIsAuth = classifyAxiosError(androidError);
    log.epic.warn({ error: androidError.message }, 'ANDROID refresh failed, trying LAUNCHER...');

    // PASO 2: Fallback a LAUNCHER si ANDROID falla
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        token_type: 'eg1',
      });

      const res = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params, {
        headers: {
          Authorization: `basic ${LAUNCHER_CLIENT_HEADER}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      log.epic.info('Token refreshed with LAUNCHER client (fallback)');
      return { success: true, data: res.data };
    } catch (launcherError: any) {
      const launcherIsAuth = classifyAxiosError(launcherError);
      log.epic.error({ error: launcherError }, 'Both ANDROID and LAUNCHER refresh failed');
      // Only mark as auth error if BOTH clients confirmed it (rules out network ambiguity)
      return { success: false, isAuthError: androidIsAuth && launcherIsAuth };
    }
  }
}

/**
 * Intenta obtener tokens usando deviceAuth
 * SIEMPRE intenta primero con ANDROID
 */
export async function getTokensWithDeviceAuth(account: IDeviceAuth): Promise<EpicTokenResult> {
  let androidIsAuth = false;
  let androidRevoked = false;
  let androidCode: string | undefined;
  // PASO 1: Intentar con ANDROID (cliente principal)
  try {
    const params = new URLSearchParams({
      grant_type: 'device_auth',
      account_id: account.accountId,
      device_id: account.deviceId,
      secret: account.secret,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT_HEADER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    log.epic.debug('Tokens obtained with ANDROID deviceAuth');
    return { success: true, data: res.data };
  } catch (androidError: any) {
    androidCode = epicErrorCode(androidError);
    androidIsAuth = classifyAxiosError(androidError) && !BOT_SIDE_ERROR_CODES.has(androidCode ?? '');
    androidRevoked = androidCode === REVOKED_DEVICE_AUTH_CODE;
    log.epic.warn({ error: androidError.message, errorCode: androidCode }, 'ANDROID deviceAuth failed, trying LAUNCHER...');

    // PASO 2: Fallback a LAUNCHER si ANDROID falla
    try {
      const params = new URLSearchParams({
        grant_type: 'device_auth',
        account_id: account.accountId,
        device_id: account.deviceId,
        secret: account.secret,
        token_type: 'eg1',
      });

      const res = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params, {
        headers: {
          Authorization: `basic ${LAUNCHER_CLIENT_HEADER}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      });

      log.epic.info('Tokens obtained with LAUNCHER deviceAuth (fallback)');
      return { success: true, data: res.data };
    } catch (launcherError: any) {
      log.epic.error(
        { error: launcherError, androidCode, launcherCode: epicErrorCode(launcherError) },
        'Both ANDROID and LAUNCHER deviceAuth failed',
      );
      // LAUNCHER cannot use device_auth at all (always unauthorized_client), so only ANDROID's answer
      // says anything about the account. Bot-side codes never count as an account auth error.
      return { success: false, isAuthError: androidIsAuth, revoked: androidRevoked };
    }
  }
}

export type DeviceAuthRevocationCheck =
  /** Rejected again with the credentials stored in the DB right now */
  | { status: 'revoked'; auth: IDeviceAuth }
  /** The stored credentials work (fresh tokens were saved) */
  | { status: 'alive' }
  /** The account is no longer linked in the DB */
  | { status: 'unlinked' }
  /** Epic did not answer clearly: decide nothing */
  | { status: 'inconclusive' };

/**
 * Re-checks a device auth Epic just rejected, after a short delay and with the credentials currently
 * stored in the DB (the caller's copy may predate a re-link).
 */
export async function confirmDeviceAuthRevoked(discordId: string, accountId: string): Promise<DeviceAuthRevocationCheck> {
  await new Promise((resolve) => setTimeout(resolve, REVOCATION_RECHECK_DELAY_MS));

  const fresh = await UsuarioInfo.findOne({ id: discordId });
  const auth = fresh?.deviceAuths.find((acc) => acc.accountId === accountId);
  if (!fresh || !auth) return { status: 'unlinked' };

  const result = await getTokensWithDeviceAuth(auth);
  if (result.success) {
    const d = result.data;
    auth.accessToken = d.access_token;
    auth.expiresAt = d.expires_at;
    auth.refreshToken = d.refresh_token;
    auth.refreshExpiresAt = d.refresh_expires_at;
    if (d.displayName) auth.displayName = d.displayName;
    clearAutomationSuspensionOnDeviceAuth(fresh, accountId);
    await fresh.save();
    log.epic.info({ accountId }, 'Device auth re-check succeeded — account kept');
    return { status: 'alive' };
  }
  return result.revoked ? { status: 'revoked', auth } : { status: 'inconclusive' };
}

/** Token fields a successful refresh writes to the DB. */
type AccountTokens = Pick<
  IDeviceAuth,
  'accessToken' | 'expiresAt' | 'refreshToken' | 'refreshExpiresAt' | 'displayName'
>;

type AccountRefreshOutcome =
  | { tokens: AccountTokens }
  | { error: 'networkError' | 'tokenFailure' | 'noAccount' };

/** Refreshes currently running, keyed by Discord user + Epic account. */
const refreshesInFlight = new Map<string, Promise<AccountRefreshOutcome>>();

function accountTokens(account: IDeviceAuth): AccountTokens {
  return {
    accessToken: account.accessToken,
    expiresAt: account.expiresAt,
    refreshToken: account.refreshToken,
    refreshExpiresAt: account.refreshExpiresAt,
    displayName: account.displayName,
  };
}

function tokensFromEpicResponse(data: any): AccountTokens {
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_at,
    refreshToken: data.refresh_token,
    refreshExpiresAt: data.refresh_expires_at,
    displayName: data.displayName,
  };
}

function applyAccountTokens(account: IDeviceAuth, tokens: AccountTokens): void {
  account.accessToken = tokens.accessToken;
  account.expiresAt = tokens.expiresAt;
  account.refreshToken = tokens.refreshToken;
  account.refreshExpiresAt = tokens.refreshExpiresAt;
  if (tokens.displayName) account.displayName = tokens.displayName;
}

function isLocallyValidToken(tokens: { accessToken?: string | null; expiresAt?: string | null }): boolean {
  if (!tokens.accessToken || !tokens.expiresAt) return false;
  const expiresAt = Date.parse(tokens.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60000;
}

/**
 * A concurrent refresh (another command, autocomplete, automation, another bot
 * process) may have already saved a new token while ours was failing. Reusing
 * it avoids telling the user their session expired when it is perfectly fine.
 */
async function recoverTokensFromDb(
  discordId: string,
  accountId: string,
  staleAccessToken: string | null,
): Promise<{ tokens: AccountTokens } | null> {
  try {
    const fresh = await UsuarioInfo.findOne({ id: discordId }).lean<{ deviceAuths?: IDeviceAuth[] }>();
    const account = fresh?.deviceAuths?.find((acc) => acc.accountId === accountId);
    if (!account) return null;
    // A different token with a future expiry can only come from a refresh done elsewhere.
    if (account.accessToken === staleAccessToken || !isLocallyValidToken(account)) return null;
    log.epic.info({ accountId }, 'Token was already refreshed elsewhere — reusing stored tokens');
    return { tokens: accountTokens(account) };
  } catch (err) {
    log.epic.warn({ err, accountId }, 'Could not re-check stored tokens after a failed refresh');
    return null;
  }
}

async function persistRefreshedTokens(
  userInfo: IUsuarioInfo,
  accountId: string,
  tokens: AccountTokens,
): Promise<void> {
  const account = userInfo.deviceAuths.find((acc) => acc.accountId === accountId);
  if (!account) return;
  applyAccountTokens(account, tokens);
  clearAutomationSuspensionOnDeviceAuth(userInfo, accountId);

  // Update only this account's entry: saving the whole document from a stale copy
  // overwrites tokens another concurrent refresh just wrote (or shifts slots when
  // the array changed meanwhile).
  const $set: Record<string, unknown> = {
    'deviceAuths.$.accessToken': tokens.accessToken,
    'deviceAuths.$.expiresAt': tokens.expiresAt,
    'deviceAuths.$.refreshToken': tokens.refreshToken,
    'deviceAuths.$.refreshExpiresAt': tokens.refreshExpiresAt,
    'deviceAuths.$.automationSuspended': false,
    'deviceAuths.$.automationSuspendedAt': null,
  };
  if (tokens.displayName) $set['deviceAuths.$.displayName'] = tokens.displayName;

  try {
    await UsuarioInfo.updateOne(
      { id: userInfo.id, 'deviceAuths.accountId': accountId },
      { $set },
    );
  } catch (err) {
    // Tokens are valid in memory; the next refresh will persist them again.
    log.epic.warn({ err, accountId }, 'Could not save refreshed tokens');
  }
}

async function performAccountRefresh(
  userInfo: IUsuarioInfo,
  accountId: string,
): Promise<AccountRefreshOutcome> {
  const account = userInfo.deviceAuths.find((acc) => acc.accountId === accountId);
  if (!account) {
    // Not linked: drop its stale automation entries so no system runs on it (checked against the DB first)
    void purgeUnlinkedAccount(userInfo.id, accountId).catch(() => undefined);
    return { error: 'noAccount' };
  }
  const staleAccessToken = account.accessToken;

  log.epic.info({ accountId }, 'AccessToken invalid, attempting refresh...');

  // 1. Intentar refrescar con refreshToken (ANDROID primero)
  const refreshResult = account.refreshToken ? await verifyRefreshToken(account.refreshToken) : null;
  if (refreshResult?.success) {
    const tokens = tokensFromEpicResponse(refreshResult.data);
    await persistRefreshedTokens(userInfo, accountId, tokens);
    log.epic.info({ accountId }, 'Token refreshed successfully with refreshToken');
    const { clearAutomationSuspension } = await import('../automation/tokenFailurePolicy.ts');
    void clearAutomationSuspension(userInfo.id, accountId).catch(() => undefined);
    return { tokens };
  }

  // If refresh failed due to a network/server error, don't conclude the token is permanently invalid
  if (refreshResult && !refreshResult.isAuthError) {
    log.epic.warn({ accountId }, 'RefreshToken request failed due to network/server error — skipping account this cycle');
    return (await recoverTokensFromDb(userInfo.id, accountId, staleAccessToken)) ?? { error: 'networkError' };
  }

  log.epic.warn({ accountId }, 'RefreshToken failed, trying deviceAuth...');

  // 2. Si el refreshToken no sirve, intentar con deviceAuth (ANDROID primero)
  const deviceAuthResult = await getTokensWithDeviceAuth(account);
  if (deviceAuthResult.success) {
    const tokens = tokensFromEpicResponse(deviceAuthResult.data);
    await persistRefreshedTokens(userInfo, accountId, tokens);
    log.epic.info({ accountId }, 'Token refreshed successfully with deviceAuth');
    const { clearAutomationSuspension } = await import('../automation/tokenFailurePolicy.ts');
    void clearAutomationSuspension(userInfo.id, accountId).catch(() => undefined);
    return { tokens };
  }

  // If device auth also failed due to a network/server error, preserve the account
  if (!deviceAuthResult.isAuthError) {
    log.epic.warn({ accountId }, 'DeviceAuth request failed due to network/server error — skipping account this cycle');
    return (await recoverTokensFromDb(userInfo.id, accountId, staleAccessToken)) ?? { error: 'networkError' };
  }

  // 3. Si todo falla con errores de autenticación confirmados (401/403)
  log.epic.error({ accountId }, 'All refresh methods failed for account — confirmed auth failure');
  if (deviceAuthResult.revoked) {
    const outcome = await handleRevokedAccount(userInfo, accountId, confirmDeviceAuthRevoked);
    // Still valid (or re-linked meanwhile): skip this run without suspending anything
    if (outcome === 'kept') {
      return (await recoverTokensFromDb(userInfo.id, accountId, staleAccessToken)) ?? { error: 'networkError' };
    }
    // 'removed' (account gone, callers stop) and 'unconfirmed' (usual suspension) both surface as tokenFailure
  }
  return (await recoverTokensFromDb(userInfo.id, accountId, staleAccessToken)) ?? { error: 'tokenFailure' };
}

/**
 * Refresca una cuenta específica (cualquier cuenta, no solo la main)
 * @param userInfo - Documento del usuario
 * @param accountId - ID de la cuenta a refrescar
 * @returns Object con la cuenta actualizada o null si falló
 */
export async function refreshAccountToken(
  userInfo: IUsuarioInfo,
  accountId: string,
  force = false,
): Promise<{ account: IDeviceAuth | null; error?: string }> {
  let account = userInfo.deviceAuths.find((acc) => acc.accountId === accountId);
  if (!account) {
    // Not linked: drop its stale automation entries so no system runs on it (checked against the DB first)
    void purgeUnlinkedAccount(userInfo.id, accountId).catch(() => undefined);
    return { account: null, error: 'noAccount' };
  }

  // 1. Verificar accessToken (omitted if force refresh is requested)
  if (!force) {
    const isAccessTokenValid = await verifyToken(account.accessToken, account.expiresAt);
    if (isAccessTokenValid) {
      log.epic.debug({ accountId }, 'AccessToken is valid, no refresh needed');
      if (account.automationSuspended) {
        clearAutomationSuspensionOnDeviceAuth(userInfo, accountId);
        try {
          // Only touch the flag: never save the whole stale document here.
          await UsuarioInfo.updateOne(
            { id: userInfo.id, 'deviceAuths.accountId': accountId },
            { $set: { 'deviceAuths.$.automationSuspended': false, 'deviceAuths.$.automationSuspendedAt': null } },
          );
        } catch (err) {
          log.epic.warn({ err, accountId }, 'Could not clear automation suspension flag');
        }
        const { clearAutomationSuspension } = await import('../automation/tokenFailurePolicy.ts');
        void clearAutomationSuspension(userInfo.id, accountId).catch(() => undefined);
      }
      return { account, error: undefined };
    }

    // The caller's document may be stale (e.g. autocomplete and the command load
    // it at the same time). Prefer a token another refresh already stored.
    const stored = await recoverTokensFromDb(userInfo.id, accountId, account.accessToken);
    if (stored) {
      applyAccountTokens(account, stored.tokens);
      clearAutomationSuspensionOnDeviceAuth(userInfo, accountId);
      return { account, error: undefined };
    }
  }

  // Coalesce concurrent refreshes of the same account. Refresh tokens rotate on
  // every use, so a second parallel refresh with the old token fails at Epic and
  // used to surface a false "session expired" even though the first one worked.
  const refreshKey = `${userInfo.id}:${accountId}`;
  let refresh = refreshesInFlight.get(refreshKey);
  if (!refresh) {
    refresh = performAccountRefresh(userInfo, accountId);
    refreshesInFlight.set(refreshKey, refresh);
    const clearRefresh = () => {
      if (refreshesInFlight.get(refreshKey) === refresh) refreshesInFlight.delete(refreshKey);
    };
    refresh.then(clearRefresh, clearRefresh);
  }

  let outcome: AccountRefreshOutcome;
  try {
    outcome = await refresh;
  } catch (err) {
    log.epic.error({ err, accountId }, 'Unexpected error while refreshing account');
    return { account: null, error: 'networkError' };
  }

  account = userInfo.deviceAuths.find((acc) => acc.accountId === accountId);
  if (!account) return { account: null, error: 'noAccount' };

  if ('tokens' in outcome) {
    applyAccountTokens(account, outcome.tokens);
    clearAutomationSuspensionOnDeviceAuth(userInfo, accountId);
    return { account, error: undefined };
  }

  return { account: null, error: outcome.error };
}

/**
 * Refresca o renueva el accessToken de la cuenta principal del usuario
 * @returns Object con mainAccount actualizado o null si falló
 */
export async function refreshMainAccountToken(discordUserId: string): Promise<{ mainAccount: IDeviceAuth | null; error?: string }> {
  const db = await UsuarioInfo.findOne({ id: discordUserId });
  return refreshMainAccountTokenForUser(db, discordUserId);
}

/** Same as refreshMainAccountToken but reuses an already loaded UsuarioInfo document. */
export async function refreshMainAccountTokenForUser(
  db: IUsuarioInfo | null,
  discordUserId: string,
): Promise<{ mainAccount: IDeviceAuth | null; error?: string }> {
  if (!db || !db.deviceAuths || db.deviceAuths.length === 0) {
    return { mainAccount: null, error: 'no_accounts' };
  }

  const mainAccount = db.deviceAuths.find((acc) => acc.cuentaMain);
  if (!mainAccount) {
    return { mainAccount: null, error: 'no_main' };
  }

  // Usar la función genérica de refresh
  const result = await refreshAccountToken(db, mainAccount.accountId);
  
  if (!result.account) {
    if (result.error === 'tokenFailure') {
      const main = db.deviceAuths.find((acc) => acc.cuentaMain);
      if (main) {
        const suspendedAt = new Date().toISOString();
        main.automationSuspended = true;
        main.automationSuspendedAt = suspendedAt;
        try {
          // Atomic flag update: a full save of this document could overwrite the
          // fresh tokens another refresh just stored for the same account.
          await UsuarioInfo.updateOne(
            { id: discordUserId, 'deviceAuths.accountId': main.accountId },
            {
              $set: {
                'deviceAuths.$.automationSuspended': true,
                'deviceAuths.$.automationSuspendedAt': suspendedAt,
              },
            },
          );
        } catch (err) {
          log.epic.warn({ err, userId: discordUserId, accountId: main.accountId }, 'Could not persist automation suspension');
        }
        const { suspendAutomationDocsOnly } = await import('../automation/tokenFailurePolicy.ts');
        await suspendAutomationDocsOnly(discordUserId, main.accountId);
      }
      log.epic.warn({ userId: discordUserId }, 'Main account auth expired — automations suspended (device auth kept for /login)');
    } else {
      log.epic.warn({ userId: discordUserId, error: result.error }, 'Token refresh failed — transient error, main account preserved');
    }
    return { mainAccount: null, error: result.error || 'tokenFailure' };
  }

  return { mainAccount: result.account, error: undefined };
}

/**
 * Load main account after interactionCreate `auth: true` refresh.
 * Does not call Epic again — avoids duplicate refresh / device_auth churn.
 */
export async function loadUsuarioMainAccount(
  discordUserId: string,
): Promise<{ user: IUsuarioInfo; mainAccount: IDeviceAuth } | null> {
  const user = await UsuarioInfo.findOne({ id: discordUserId });
  if (!user?.deviceAuths?.length) return null;
  const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
  if (!mainAccount) return null;
  return { user, mainAccount };
}

/** Service accounts (deviceAuth.json or a taxi) whose device auth Epic rejected are skipped this long. */
const DEAD_SERVICE_ACCOUNT_MS = 6 * 60 * 60_000;
/** Taxi accounts tried per call when the service account fails; the rest wait for the next call. */
const SERVICE_FALLBACK_TRIES = 3;

const deadServiceAccounts = new Map<string, number>();
/** Taxi account standing in for deviceAuth.json while it does not work (tokens kept in memory only). */
let fallbackServiceAccount: IDeviceAuth | null = null;
const serviceRefreshInFlight = new Map<string, Promise<IDeviceAuth | null>>();

const serviceKey = (a: { accountId: string; deviceId: string }) => `${a.accountId}:${a.deviceId}`;
const isDeadServiceAccount = (a: { accountId: string; deviceId: string }) =>
  (deadServiceAccounts.get(serviceKey(a)) ?? 0) > Date.now();

function markServiceAccountDead(a: { accountId: string; deviceId: string; displayName?: string }): void {
  deadServiceAccounts.set(serviceKey(a), Date.now() + DEAD_SERVICE_ACCOUNT_MS);
  log.epic.warn({ accountId: a.accountId, displayName: a.displayName }, '[ServiceAccount] Device auth rejected — skipped for 6h');
}

/** deviceAuth.json itself: access token, then refresh token, then device auth (saved back to the file). */
async function refreshServiceAccountFile(
  deviceAuth: IDeviceAuth,
  deviceAuthPath: string,
): Promise<{ auth: IDeviceAuth } | { auth: null; network: boolean }> {
  if (await verifyToken(deviceAuth.accessToken, deviceAuth.expiresAt)) {
    log.epic.debug('deviceAuth.json accessToken is valid');
    return { auth: deviceAuth };
  }

  log.epic.info('deviceAuth.json accessToken invalid, attempting refresh...');
  const refreshResult = deviceAuth.refreshToken ? await verifyRefreshToken(deviceAuth.refreshToken) : null;
  const result = refreshResult?.success ? refreshResult : await getTokensWithDeviceAuth(deviceAuth);
  if (!result.success) return { auth: null, network: !result.isAuthError };

  const d = result.data;
  deviceAuth.accessToken = d.access_token;
  deviceAuth.expiresAt = d.expires_at;
  deviceAuth.refreshToken = d.refresh_token;
  deviceAuth.refreshExpiresAt = d.refresh_expires_at;
  if (d.displayName) deviceAuth.displayName = d.displayName;
  try {
    fs.writeFileSync(deviceAuthPath, JSON.stringify(deviceAuth, null, 2));
    log.epic.info('deviceAuth.json refreshed successfully');
  } catch (error) {
    log.epic.error({ error }, 'Failed to write deviceAuth.json after refresh');
  }
  return { auth: deviceAuth };
}

/**
 * A taxi account standing in for deviceAuth.json. Keeps using the same one while it works; on a
 * rejection moves to the next, at most SERVICE_FALLBACK_TRIES per call, and stops on network errors.
 */
async function fallbackServiceAccountToken(): Promise<IDeviceAuth | null> {
  if (fallbackServiceAccount && isLocallyValidToken(fallbackServiceAccount)) return fallbackServiceAccount;

  const devices = await getFallbackServiceDevices();
  const current = fallbackServiceAccount;
  const ordered = current
    ? [...devices.filter((d) => d.accountId === current.accountId), ...devices.filter((d) => d.accountId !== current.accountId)]
    : devices;

  let tries = 0;
  for (const device of ordered) {
    if (isDeadServiceAccount(device)) continue;
    if (tries++ >= SERVICE_FALLBACK_TRIES) break;
    const result = await getTokensWithDeviceAuth(device as unknown as IDeviceAuth);
    if (result.success) {
      const d = result.data;
      fallbackServiceAccount = {
        displayName: d.displayName ?? device.displayName,
        accountId: device.accountId,
        deviceId: device.deviceId,
        secret: device.secret,
        cuentaMain: true,
        accessToken: d.access_token,
        expiresAt: d.expires_at,
        refreshToken: d.refresh_token,
        refreshExpiresAt: d.refresh_expires_at,
      };
      if (current?.accountId !== device.accountId) {
        log.epic.warn({ displayName: fallbackServiceAccount.displayName }, '[ServiceAccount] deviceAuth.json unavailable — using taxi account');
      }
      return fallbackServiceAccount;
    }
    if (!result.isAuthError) break;
    markServiceAccountDead(device);
  }

  log.epic.error('[ServiceAccount] No service account available (deviceAuth.json and taxi fallbacks failed)');
  return null;
}

/**
 * Token of the bot's service account (feeds, lookups, status checks…): deviceAuth.json, or a taxi
 * account when that one is rejected. Concurrent calls share one refresh.
 * @param filePath Ruta opcional al JSON (default: helpers/data/deviceAuth.json)
 */
export async function refreshDeviceAuthJson(filePath?: string): Promise<IDeviceAuth | null> {
  const deviceAuthPath = resolveDeviceAuthJsonPath(filePath);
  const running = serviceRefreshInFlight.get(deviceAuthPath);
  if (running) return running;

  const task = (async (): Promise<IDeviceAuth | null> => {
    let deviceAuth: IDeviceAuth | null = null;
    try {
      deviceAuth = fs.existsSync(deviceAuthPath) ? JSON.parse(fs.readFileSync(deviceAuthPath, 'utf8')) : null;
    } catch (error) {
      log.epic.error({ error }, 'Failed to read deviceAuth.json');
    }

    // A new device auth written to the file has a new key, so it is tried right away
    if (deviceAuth && !isDeadServiceAccount(deviceAuth)) {
      const result = await refreshServiceAccountFile(deviceAuth, deviceAuthPath);
      if (result.auth) {
        fallbackServiceAccount = null;
        return result.auth;
      }
      // Network trouble would fail on every taxi too: only reuse a fallback token already in hand
      if (result.network) {
        return fallbackServiceAccount && isLocallyValidToken(fallbackServiceAccount) ? fallbackServiceAccount : null;
      }
      markServiceAccountDead(deviceAuth);
    } else if (!deviceAuth) {
      log.epic.warn('deviceAuth.json not found or unreadable — using taxi account');
    }

    return fallbackServiceAccountToken();
  })();

  serviceRefreshInFlight.set(deviceAuthPath, task);
  try {
    return await task;
  } finally {
    serviceRefreshInFlight.delete(deviceAuthPath);
  }
}

/**
 * Gets a launcher-scoped access token via exchange code.
 * Required for endpoints like device auth list that only work with launcher client.
 * Takes a valid access token (any client) and exchanges it for a launcher token.
 */
const LAUNCHER_EXCHANGE_HEADER = 'MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=';

export async function getLauncherToken(accessToken: string): Promise<string | null> {
  try {
    // Step 1: Get exchange code from current token
    const exchangeRes = await axios.get(Endpoints.OAUTH_EXCHANGE, {
      headers: { Authorization: `bearer ${accessToken}` },
      timeout: 10000,
    });

    const exchangeCode = exchangeRes.data?.code;
    if (!exchangeCode) return null;

    // Step 2: Exchange for launcher token
    const params = new URLSearchParams({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode,
      token_type: 'eg1',
    });

    const launcherRes = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params, {
      headers: {
        Authorization: `basic ${LAUNCHER_EXCHANGE_HEADER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    });

    return launcherRes.data?.access_token ?? null;
  } catch (err: any) {
    log.epic.error({ error: err.message }, 'Failed to get launcher token via exchange');
    return null;
  }
}
