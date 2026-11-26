import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { log } from '#helpers/core/logger.ts';
import { verifyRefreshToken } from '../auth/tokenRefresh.ts';

const ANDROID_AUTH = 'Basic M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';
const LAUNCHER_AUTH = 'Basic OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3';
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const EASY_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const EASY_LOGIN_POLL_MS = 11_000;

export type TemporaryCheckerLoginMethod = 'easy' | 'auth_code' | 'exchange_code' | 'device_auth';

export interface TemporaryCheckerAccount {
  accountId: string;
  displayName: string;
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
  loginMethod: TemporaryCheckerLoginMethod;
  deviceId?: string;
  secret?: string;
}

function shouldRefreshToken(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

function mapTokenToTemporaryAccount(
  tokenData: any,
  loginMethod: TemporaryCheckerLoginMethod,
  extra?: { deviceId?: string; secret?: string }
): TemporaryCheckerAccount {
  return {
    accountId: tokenData.account_id ?? tokenData.accountId,
    displayName: tokenData.displayName ?? tokenData.display_name ?? 'Unknown',
    accessToken: tokenData.access_token,
    expiresAt: tokenData.expires_at ?? null,
    refreshToken: tokenData.refresh_token ?? null,
    refreshExpiresAt: tokenData.refresh_expires_at ?? null,
    loginMethod,
    deviceId: extra?.deviceId,
    secret: extra?.secret,
  };
}

async function postAndroidToken(params: URLSearchParams): Promise<any> {
  const response = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params.toString(), {
    headers: {
      Authorization: ANDROID_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return response.data;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createTemporaryAccountFromExchangeCode(exchangeCode: string): Promise<TemporaryCheckerAccount> {
  const tokenData = await postAndroidToken(new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: exchangeCode,
    token_type: 'eg1',
  }));

  return mapTokenToTemporaryAccount(tokenData, 'exchange_code');
}

export async function createTemporaryAccountFromAuthorizationCode(authCode: string): Promise<TemporaryCheckerAccount> {
  const tokenData = await postAndroidToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    token_type: 'eg1',
  }));

  return mapTokenToTemporaryAccount(tokenData, 'auth_code');
}

export async function createTemporaryAccountFromDeviceAuth(
  accountId: string,
  deviceId: string,
  secret: string,
): Promise<TemporaryCheckerAccount> {
  const tokenData = await postAndroidToken(new URLSearchParams({
    grant_type: 'device_auth',
    account_id: accountId,
    device_id: deviceId,
    secret,
    token_type: 'eg1',
  }));

  return mapTokenToTemporaryAccount(tokenData, 'device_auth', { deviceId, secret });
}

export async function beginTemporaryEasyLogin(): Promise<{ verificationUrl: string; deviceCode: string }> {
  const launcherTokenResponse = await axios.post(
    Endpoints.OAUTH_TOKEN_CREATE,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: LAUNCHER_AUTH,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const deviceAuthorizationResponse = await axios.post(
    Endpoints.OAUTH_DEVICE_CODE,
    'prompt=login',
    {
      headers: {
        Authorization: `bearer ${launcherTokenResponse.data.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return {
    verificationUrl: deviceAuthorizationResponse.data.verification_uri_complete,
    deviceCode: deviceAuthorizationResponse.data.device_code,
  };
}

export async function pollTemporaryEasyLogin(
  deviceCode: string,
  options?: { isCancelled?: () => boolean },
): Promise<TemporaryCheckerAccount> {
  const expiresAt = Date.now() + EASY_LOGIN_TIMEOUT_MS;

  while (Date.now() < expiresAt) {
    if (options?.isCancelled?.()) {
      throw new Error('TEMP_AUTH_CANCELLED');
    }

    try {
      const launcherTokenResponse = await axios.post(
        Endpoints.OAUTH_TOKEN_CREATE,
        `grant_type=device_code&device_code=${deviceCode}`,
        {
          headers: {
            Authorization: LAUNCHER_AUTH,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const exchangeResponse = await axios.get(Endpoints.OAUTH_EXCHANGE, {
        headers: { Authorization: `bearer ${launcherTokenResponse.data.access_token}` },
      });

      const androidTokenData = await postAndroidToken(new URLSearchParams({
        grant_type: 'exchange_code',
        exchange_code: exchangeResponse.data.code,
        token_type: 'eg1',
      }));

      return mapTokenToTemporaryAccount(androidTokenData, 'easy');
    } catch (error: any) {
      const errorCode = error?.response?.data?.errorCode;
      if (errorCode === 'errors.com.epicgames.account.oauth.authorization_pending') {
        await wait(EASY_LOGIN_POLL_MS);
        continue;
      }

      if (errorCode === 'errors.com.epicgames.account.oauth.authorization_declined') {
        throw new Error('TEMP_AUTH_DECLINED');
      }

      log.epic.error({ error }, 'Temporary checker easy login failed');
      throw new Error('TEMP_AUTH_FAILED');
    }
  }

  throw new Error('TEMP_AUTH_TIMEOUT');
}

export async function refreshTemporaryCheckerAccount(
  account: TemporaryCheckerAccount,
): Promise<TemporaryCheckerAccount> {
  if (!shouldRefreshToken(account.expiresAt)) {
    return account;
  }

  if (account.refreshToken) {
    const refreshResult = await verifyRefreshToken(account.refreshToken);
    if (refreshResult.success) {
      return mapTokenToTemporaryAccount(refreshResult.data, account.loginMethod, {
        deviceId: account.deviceId,
        secret: account.secret,
      });
    }
  }

  if (account.deviceId && account.secret) {
    return createTemporaryAccountFromDeviceAuth(account.accountId, account.deviceId, account.secret);
  }

  throw new Error('TEMP_AUTH_EXPIRED');
}