import axios from 'axios';

// Mismo cliente que ya usas para el XMPP (launcherAppClient2)
const LAUNCHER_CLIENT_ID     = '34a02cf8f4414e29b15921876da36f9a';
const LAUNCHER_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';

/**
 * Obtiene un token EG1 (JWT firmado con prefijo eg1~) a partir
 * del accessToken actual. Es el formato que acepta connect.ol.epicgames.com.
 */
export async function getEosToken(epicAccessToken: string): Promise<string> {
  const credentials = Buffer.from(
    `${LAUNCHER_CLIENT_ID}:${LAUNCHER_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const response = await axios.post(
      'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
      new URLSearchParams({
        grant_type:   'exchange_code',
        exchange_code: await getExchangeCode(epicAccessToken),
        token_type:   'eg1',           // 👈 JWT firmado, lo que acepta el STOMP
      }),
      {
        headers: {
          Authorization:  `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const token: string = response.data.access_token;
    console.log('[EOS] eg1 token obtenido:', token.substring(0, 30) + '...');
    return token;
  } catch (e: any) {
    console.error('EOS TOKEN ERROR:', JSON.stringify(e.response?.data, null, 2));
    throw e;
  }
}

/**
 * Obtiene un exchange code a partir del accessToken actual.
 */
async function getExchangeCode(epicAccessToken: string): Promise<string> {
  const response = await axios.get(
    'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange',
    {
      headers: { Authorization: `Bearer ${epicAccessToken}` },
    },
  );
  return response.data.code;
}