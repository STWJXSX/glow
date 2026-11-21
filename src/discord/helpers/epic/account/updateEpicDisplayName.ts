import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { log } from '#helpers/core/logger.ts';
import { refreshAccountToken } from '../auth/tokenRefresh.ts';
import { exchangeLauncherEg1 } from '../auth/v42LauncherToken.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

const ACCEPT_PRIVACY =
  'https://account-public-service-prod.ol.epicgames.com/account/api/public/corrections/acceptPrivacyPolicy';

export type UpdateDisplayNameErrorCode =
  | 'no_user'
  | 'no_main'
  | 'invalid'
  | 'same'
  | 'cooldown'
  | 'token'
  | 'api';

export type UpdateDisplayNameResult =
  | { ok: true; oldName: string; newName: string; accountId: string }
  | {
      ok: false;
      code: UpdateDisplayNameErrorCode;
      apiMessage?: string;
      lastDisplayNameChange?: string | null;
    };

/** Epic display name rules (launcher account management). */
export function validateEpicDisplayName(value: string): UpdateDisplayNameErrorCode | null {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 16) return 'invalid';
  if (!/^[a-zA-Z0-9 ._-]+$/.test(trimmed)) return 'invalid';
  return null;
}

async function getClientCredentialsToken(): Promise<string> {
  const { ANDROID_CLIENT } = await import('../auth/clientTokens.ts');
  const body = new URLSearchParams({ grant_type: 'client_credentials', token_type: 'eg1' });
  const { data } = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, body.toString(), {
    headers: {
      Authorization: `Basic ${ANDROID_CLIENT.authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 20_000,
  });
  return data.access_token as string;
}

async function acceptPrivacyPolicy(continuation: string): Promise<void> {
  const cc = await getClientCredentialsToken();
  await axios.put(
    ACCEPT_PRIVACY,
    { continuation },
    {
      headers: {
        Authorization: `Bearer ${cc}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
      validateStatus: (s) => s >= 200 && s < 300,
    },
  );
}

async function putDisplayName(
  launcherToken: string,
  accountId: string,
  displayName: string,
  continuation?: string | null,
): Promise<{ ok: true; displayName: string } | { ok: false; message: string }> {
  const payload = continuation ? { displayName, continuation } : { displayName };
  const res = await axios.put(`${Endpoints.ACCOUNT_PUBLIC}/${accountId}`, payload, {
    headers: {
      Authorization: `Bearer ${launcherToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 20_000,
    validateStatus: () => true,
  });

  if (res.status >= 200 && res.status < 300) {
    const info = res.data?.accountInfo ?? res.data;
    return { ok: true, displayName: (info?.displayName as string) ?? displayName };
  }

  const data = res.data ?? {};
  if (data.continuation) {
    return putDisplayName(launcherToken, accountId, displayName, data.continuation as string);
  }

  const message =
    (data.errorMessage as string) ||
    (data.message as string) ||
    `HTTP ${res.status}`;
  return { ok: false, message };
}

export async function updateMainAccountDisplayName(
  discordId: string,
  newDisplayName: string,
): Promise<UpdateDisplayNameResult> {
  const validationError = validateEpicDisplayName(newDisplayName);
  if (validationError) {
    return { ok: false, code: validationError };
  }

  const wanted = newDisplayName.trim();

  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo) {
    return { ok: false, code: 'no_user' };
  }

  const mainIndex = userInfo.deviceAuths.findIndex((acc) => acc.cuentaMain);
  if (mainIndex === -1) {
    return { ok: false, code: 'no_main' };
  }

  const mainAccount = userInfo.deviceAuths[mainIndex];

  const { account, error } = await refreshAccountToken(userInfo, mainAccount.accountId);
  if (!account?.accessToken) {
    log.epic.warn({ discordId, error }, '[DisplayName] Token refresh failed');
    return { ok: false, code: 'token' };
  }

  let launcherToken: string;
  try {
    launcherToken = await exchangeLauncherEg1(account.accessToken);
  } catch (err: any) {
    const payload = err?.response?.data;
    const continuation = payload?.continuation as string | undefined;
    if (payload?.numericErrorCode === 18206 && continuation) {
      try {
        await acceptPrivacyPolicy(continuation);
        launcherToken = await exchangeLauncherEg1(account.accessToken);
      } catch (retryErr: any) {
        log.epic.error({ err: retryErr }, '[DisplayName] Launcher token after privacy failed');
        return { ok: false, code: 'token', apiMessage: retryErr?.message };
      }
    } else {
      log.epic.error({ err }, '[DisplayName] Launcher token failed');
      return { ok: false, code: 'token', apiMessage: err?.message };
    }
  }

  let accountInfo: Record<string, unknown>;
  try {
    const { data } = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${mainAccount.accountId}`, {
      headers: { Authorization: `Bearer ${launcherToken}` },
      timeout: 20_000,
    });
    accountInfo = data;
  } catch (err: any) {
    return {
      ok: false,
      code: 'api',
      apiMessage: err?.response?.data?.errorMessage || err?.message,
    };
  }

  const current = String(accountInfo.displayName ?? mainAccount.displayName ?? '');
  if (current === wanted) {
    return { ok: false, code: 'same' };
  }

  if (accountInfo.canUpdateDisplayName === false) {
    return {
      ok: false,
      code: 'cooldown',
      lastDisplayNameChange: (accountInfo.lastDisplayNameChange as string) ?? null,
    };
  }

  const updated = await putDisplayName(launcherToken, mainAccount.accountId, wanted);
  if (!updated.ok) {
    return { ok: false, code: 'api', apiMessage: updated.message };
  }

  userInfo.deviceAuths[mainIndex].displayName = updated.displayName;
  await userInfo.save();

  return {
    ok: true,
    oldName: current,
    newName: updated.displayName,
    accountId: mainAccount.accountId,
  };
}
