import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';

export interface EpicFriend {
  accountId: string;
  displayName: string;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; friends: EpicFriend[] }>();

/** Friends of `accountId` with display names. Cached 60s so autocomplete keystrokes stay cheap. */
export async function getFriendsWithNames(accountId: string, accessToken: string): Promise<EpicFriend[]> {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.friends;

  const friendsRes = await axios.get<Array<{ accountId: string }>>(
    `${Endpoints.FRIENDS}/${accountId}/friends`,
    { headers: { Authorization: `bearer ${accessToken}` }, timeout: 10_000 },
  );

  const ids = friendsRes.data.map((f) => f.accountId);
  const friends: EpicFriend[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const qs = ids.slice(i, i + 100).map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
    const accountsRes = await axios.get<Array<{ id: string; displayName: string }>>(
      `${Endpoints.ACCOUNT_PUBLIC}?${qs}`,
      { headers: { Authorization: `bearer ${accessToken}` }, timeout: 10_000 },
    );
    for (const acc of accountsRes.data) {
      if (acc.displayName) friends.push({ accountId: acc.id, displayName: acc.displayName });
    }
  }

  cache.set(accountId, { at: Date.now(), friends });
  return friends;
}
