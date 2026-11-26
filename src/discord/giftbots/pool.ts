import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { GiftBotAccount, GiftWallet, type IGiftBotAccount } from '#models/GiftBotPool.ts';

export const MIN_VBUCKS_IN_POOL = 500;
/** Epic requires ~48h of friendship before gifting. */
export const MIN_FRIEND_AGE_MS = 48 * 3600 * 1000;

const ANDROID_AUTH =
  'Basic M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';

async function oauth(params: Record<string, string>): Promise<any> {
  const { data } = await axios.post(
    Endpoints.OAUTH_TOKEN,
    new URLSearchParams({ ...params, token_type: 'eg1' }).toString(),
    { headers: { Authorization: ANDROID_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
  );
  return data;
}

export async function ensureBotToken(bot: IGiftBotAccount): Promise<string> {
  const expiresAt = bot.tokenExpiresAt ? bot.tokenExpiresAt.getTime() : 0;
  if (bot.accessToken && expiresAt > Date.now() + 60_000) return bot.accessToken;

  const { accountId, deviceId, secret } = bot.deviceAuth;
  let tokenData: any;
  try {
    if (!bot.refreshToken) throw new Error('no refresh token');
    tokenData = await oauth({ grant_type: 'refresh_token', refresh_token: bot.refreshToken.trim() });
  } catch {
    tokenData = await oauth({
      grant_type: 'device_auth',
      account_id: accountId.trim(),
      device_id: deviceId.trim(),
      secret: secret.trim(),
    });
  }

  bot.accessToken = tokenData.access_token;
  if (tokenData.refresh_token) bot.refreshToken = tokenData.refresh_token;
  if (tokenData.expires_at) bot.tokenExpiresAt = new Date(tokenData.expires_at);
  else if (tokenData.expires_in) bot.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  await bot.save();
  return bot.accessToken;
}

export type BotFriendship =
  | { status: 'eligible'; bot: IGiftBotAccount; accessToken: string }
  | { status: 'tooRecent'; bot: IGiftBotAccount }
  | { status: 'notFriends'; bot: IGiftBotAccount };

/**
 * Looks through the pool bots that can afford `price` and returns the first that has
 * had the main account as a friend for 48h+, plus the best "almost" state for messaging.
 */
export async function findBotForMain(
  mainAccountId: string,
  price: number,
): Promise<{ eligible: BotFriendship | null; others: BotFriendship[]; poolEmpty: boolean }> {
  const bots = await GiftBotAccount.find({
    enabled: true,
    poolAvailable: true,
    available: { $gte: price },
  })
    .sort({ available: 1 })
    .exec();

  const others: BotFriendship[] = [];
  for (const bot of bots) {
    try {
      const accessToken = await ensureBotToken(bot);
      const { data } = await axios.get<Array<{ accountId: string; created?: string }>>(
        `${Endpoints.FRIENDS}/${bot.deviceAuth.accountId}/friends`,
        { headers: { Authorization: `bearer ${accessToken}` }, timeout: 15000 },
      );
      const entry = (Array.isArray(data) ? data : []).find(
        (f) => f.accountId?.toLowerCase() === mainAccountId.toLowerCase(),
      );
      if (!entry) {
        others.push({ status: 'notFriends', bot });
        continue;
      }
      const created = entry.created ? Date.parse(entry.created) : NaN;
      if (Number.isFinite(created) && Date.now() - created < MIN_FRIEND_AGE_MS) {
        others.push({ status: 'tooRecent', bot });
        continue;
      }
      return { eligible: { status: 'eligible', bot, accessToken }, others, poolEmpty: false };
    } catch {
      /* skip unreachable bot */
    }
  }
  return { eligible: null, others, poolEmpty: bots.length === 0 };
}

export async function getWalletBalance(discordId: string): Promise<number> {
  const wallet = await GiftWallet.findOne({ discordId }).lean().exec();
  return wallet?.available ?? 0;
}

/** Atomic debit; returns remaining balance or null if insufficient. */
export async function walletTryDebit(discordId: string, price: number): Promise<number | null> {
  const wallet = await GiftWallet.findOneAndUpdate(
    { discordId, available: { $gte: price } },
    { $inc: { available: -price } },
    { new: true },
  ).exec();
  return wallet ? wallet.available : null;
}

export async function walletCredit(discordId: string, amount: number): Promise<void> {
  await GiftWallet.findOneAndUpdate({ discordId }, { $inc: { available: amount } }, { upsert: true }).exec();
}

export async function applyBotSpend(botAccountId: string, price: number): Promise<void> {
  const bot = await GiftBotAccount.findOne({ 'deviceAuth.accountId': botAccountId }).exec();
  if (!bot) return;
  bot.available = Math.max(0, bot.available - price);
  if (bot.available < MIN_VBUCKS_IN_POOL) bot.poolAvailable = false;
  await bot.save();
}
