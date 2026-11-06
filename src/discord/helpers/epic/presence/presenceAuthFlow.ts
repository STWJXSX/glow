/**
 * Presence/XMPP token helpers — refresh existing device auth only.
 * Never POST .../deviceAuth (new credentials). Use authHandler.processAccountRegistration for that.
 */

import axios from 'axios';
import { ANDROID_CLIENT } from '../auth/clientTokens.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';

const ANDROID_SCOPES = 'basic_profile friends_list presence offline_access';

export interface PresenceDeviceAuth {
  accountId: string;
  deviceId: string;
  secret: string;
}

export interface AndroidTokenResult {
  accessToken: string;
  accountId: string;
  displayName?: string;
  expiresAt?: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
  scope?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) return {};
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export function summarizeTokenClaims(accessToken: string): string {
  const p = decodeJwtPayload(accessToken);
  const keys = Object.keys(p).filter((k) => !['sub', 'jti', 'iss', 'exp', 'iat'].includes(k));
  const presence = tokenPresenceClaims(accessToken);
  return `jwt keys=[${keys.join(',')}] presence=${presence.length ? presence.join(',') : 'none'}`;
}

export function tokenPresenceClaims(accessToken: string): string[] {
  const p = decodeJwtPayload(accessToken);
  const perms = Array.isArray(p.perms) ? p.perms : [];
  const scope = String(p.scope || p.scp || '');
  return [
    ...perms.filter((x) => String(x).includes('presence')),
    ...scope.split(' ').filter((s) => s.includes('presence')),
  ];
}

/** exchange_code → Android eg1 (authHandler.processExchangeCode) */
export async function androidTokenFromExchangeCode(
  exchangeCode: string,
  requestedScope?: string,
): Promise<AndroidTokenResult> {
  const body = new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: exchangeCode,
    token_type: 'eg1',
  });
  if (requestedScope) body.set('scope', requestedScope);
  const { data } = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, body.toString(), {
    headers: {
      Authorization: `Basic ${ANDROID_CLIENT.authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });
  return {
    accessToken: data.access_token,
    accountId: data.account_id,
    displayName: data.displayName,
    expiresAt: data.expires_at,
    refreshToken: data.refresh_token,
    refreshExpiresAt: data.refresh_expires_at,
    scope: data.scope,
  };
}

/** GET /oauth/exchange from any valid access token */
export async function createExchangeCode(accessToken: string): Promise<string> {
  const { data } = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `bearer ${accessToken}` },
    timeout: 10_000,
  });
  if (!data?.code) throw new Error('Exchange code missing in response');
  return data.code as string;
}

/**
 * Bootstrap with existing device_auth → exchange → scoped Android token.
 * Returns the same deviceAuth creds (no new Epic device registration).
 */
export async function androidTokenViaExchangeFromDeviceAuth(
  creds: PresenceDeviceAuth,
): Promise<{ token: AndroidTokenResult; deviceAuth: PresenceDeviceAuth; exchangeCode: string }> {
  const bootstrap = new URLSearchParams({
    grant_type: 'device_auth',
    account_id: creds.accountId,
    device_id: creds.deviceId,
    secret: creds.secret,
    token_type: 'eg1',
  });
  const { data: boot } = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, bootstrap.toString(), {
    headers: {
      Authorization: `Basic ${ANDROID_CLIENT.authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  const exchangeCode = await createExchangeCode(boot.access_token);
  const token = await androidTokenFromExchangeCode(exchangeCode, ANDROID_SCOPES);

  return { token, deviceAuth: creds, exchangeCode };
}
