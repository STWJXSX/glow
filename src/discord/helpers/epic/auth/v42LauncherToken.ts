import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { LAUNCHER_CLIENT } from './clientTokens.ts';

async function getExchangeCode(accessToken: string): Promise<string> {
  const { data } = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10_000,
  });
  return data.code as string;
}

async function acceptPrivacyPolicy(continuation: string): Promise<void> {
  const ccBody = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'basic_profile',
  });
  const { data: cc } = await axios.post(Endpoints.OAUTH_TOKEN, ccBody.toString(), {
    headers: {
      Authorization: `Basic ${LAUNCHER_CLIENT.authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });
  await axios.put(
    'https://account-public-service-prod.ol.epicgames.com/account/api/public/corrections/acceptPrivacyPolicy',
    { continuation },
    {
      headers: {
        Authorization: `Bearer ${cc.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    },
  );
}

/** EGL token (Launcher eg1) — STOMP stomp_auth_v1 + internal presence */
export async function exchangeLauncherEg1(gameToken: string): Promise<string> {
  const code = await getExchangeCode(gameToken);
  const body = new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: code,
    token_type: 'eg1',
  });

  try {
    const { data } = await axios.post(Endpoints.OAUTH_TOKEN, body.toString(), {
      headers: {
        Authorization: `Basic ${LAUNCHER_CLIENT.authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });
    return data.access_token as string;
  } catch (err: any) {
    const payload = err?.response?.data;
    const continuation = payload?.continuation as string | undefined;
    if (payload?.numericErrorCode === 18206 && continuation) {
      await acceptPrivacyPolicy(continuation);
      const { data } = await axios.post(Endpoints.OAUTH_TOKEN, body.toString(), {
        headers: {
          Authorization: `Basic ${LAUNCHER_CLIENT.authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15_000,
      });
      return data.access_token as string;
    }
    throw err;
  }
}
