/**
 * TRELLO (feedback board)
 * Minimal REST client. Everything is optional: with no credentials or board,
 * calls are no-ops. Missing lists are created automatically on the board.
 *
 * Env:
 *   TRELLO_KEY, TRELLO_TOKEN — API credentials
 *   TRELLO_BOARD_ID          — board id (or shortLink from the board URL)
 */

import { log } from '#helpers/core/logger.ts';
import type { FeedbackStatus, FeedbackType } from '#models/Feedback.ts';

const API = 'https://api.trello.com/1';

const key = () => process.env.TRELLO_KEY ?? '';
const token = () => process.env.TRELLO_TOKEN ?? '';
const boardId = () => process.env.TRELLO_BOARD_ID ?? '';

export function trelloEnabled(): boolean {
  return !!(key() && token() && boardId());
}

async function call(method: 'GET' | 'POST' | 'PUT', path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ key: key(), token: token(), ...params });
  const res = await fetch(`${API}${path}?${qs}`, { method, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Trello ${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

// ── Lists (found by name, created if missing) ───────────────────────────

type ListKey = 'bugs' | 'suggestions' | Exclude<FeedbackStatus, 'pending'>;

const LIST_NAMES: Record<ListKey, string> = {
  bugs: 'Bug Reports',
  suggestions: 'Suggestions',
  accepted: 'Accepted',
  investigating: 'Investigating',
  found: 'Found',
  resolved: 'Resolved / Implemented',
  rejected: 'Rejected',
};

let listsPromise: Promise<Map<ListKey, string>> | null = null;

async function loadLists(): Promise<Map<ListKey, string>> {
  const existing: Array<{ id: string; name: string }> = await call('GET', `/boards/${boardId()}/lists`, {
    filter: 'open',
    fields: 'name',
  });
  const map = new Map<ListKey, string>();
  for (const k of Object.keys(LIST_NAMES) as ListKey[]) {
    const found = existing.find((l) => l.name.trim().toLowerCase() === LIST_NAMES[k].toLowerCase());
    if (found) {
      map.set(k, found.id);
      continue;
    }
    const created = await call('POST', '/lists', { name: LIST_NAMES[k], idBoard: boardId(), pos: 'bottom' });
    map.set(k, created.id);
    log.events.info({ list: LIST_NAMES[k] }, '[Trello] List created');
  }
  return map;
}

function getLists(): Promise<Map<ListKey, string>> {
  if (!listsPromise) {
    listsPromise = loadLists().catch((err) => {
      listsPromise = null; // retry next time
      throw err;
    });
  }
  return listsPromise;
}

// ── Cards ───────────────────────────────────────────────────────────────

export interface TrelloCardInput {
  type: FeedbackType;
  title: string;
  description: string;
  imageUrl: string | null;
  postUrl: string;
}

/** Creates a card for the feedback. Returns its id and public URL, or null if disabled/failed. */
export async function createFeedbackCard(input: TrelloCardInput): Promise<{ id: string; url: string } | null> {
  if (!trelloEnabled()) return null;
  try {
    const lists = await getLists();
    const listId = lists.get(input.type === 'bugreport' ? 'bugs' : 'suggestions')!;
    const prefix = input.type === 'bugreport' ? '[Bug]' : '[Suggestion]';
    // The board may be public: no author identity on the card
    const desc = [input.description, '', '---', `Discord: ${input.postUrl}`].join('\n');

    const card = await call('POST', '/cards', {
      idList: listId,
      name: `${prefix} ${input.title}`.slice(0, 16384),
      desc: desc.slice(0, 16384),
      pos: 'top',
    });

    if (input.imageUrl) {
      await call('POST', `/cards/${card.id}/attachments`, { url: input.imageUrl }).catch((e) =>
        log.events.warn({ error: e?.message }, '[Trello] Attachment failed'),
      );
    }
    return { id: card.id as string, url: (card.shortUrl ?? card.url) as string };
  } catch (err: any) {
    log.events.warn({ error: err?.message }, '[Trello] Create card failed');
    return null;
  }
}

/** Moves the card to the list matching the new status. */
export async function moveFeedbackCard(cardId: string, status: FeedbackStatus): Promise<void> {
  if (!trelloEnabled() || !cardId || status === 'pending') return;
  try {
    const lists = await getLists();
    await call('PUT', `/cards/${cardId}`, { idList: lists.get(status)!, pos: 'top' });
  } catch (err: any) {
    log.events.warn({ error: err?.message, cardId }, '[Trello] Resolve card failed');
  }
}
