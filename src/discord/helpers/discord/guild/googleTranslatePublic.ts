/**
 * Lightweight Google Translate (public gtx endpoint).
 * Protects inline code (`...`) so slash commands survive translation.
 */

const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const TIMEOUT_MS = 12_000;

const PLACEHOLDER_RE = /__CODE(\d+)__/g;

export function protectInlineCode(text: string): { safe: string; slots: string[] } {
  const slots: string[] = [];
  const safe = text.replace(/`[^`\n]+`/g, (match) => {
    const idx = slots.length;
    slots.push(match);
    return `__CODE${idx}__`;
  });
  return { safe, slots };
}

export function restoreInlineCode(text: string, slots: string[]): string {
  return text.replace(PLACEHOLDER_RE, (_, index) => slots[Number(index)] ?? _);
}

export async function translateWithGoogle(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto',
): Promise<string> {
  if (!text.trim()) return text;

  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLang,
    tl: targetLang,
    dt: 't',
    q: text,
  });

  const res = await fetch(`${TRANSLATE_URL}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) return text;

  const json = await res.json();
  if (!Array.isArray(json?.[0])) return text;

  return json[0].map((seg: unknown[]) => (typeof seg?.[0] === 'string' ? seg[0] : '')).join('');
}

export async function translateBatchWithGoogle(
  text: string,
  targets: readonly { key: string; googleCode: string }[],
  sourceLang: string = 'auto',
): Promise<Map<string, string>> {
  const { safe, slots } = protectInlineCode(text);
  const results = new Map<string, string>();

  await Promise.all(
    targets.map(async ({ key, googleCode }) => {
      try {
        const raw = await translateWithGoogle(safe, googleCode, sourceLang);
        results.set(key, restoreInlineCode(raw, slots));
      } catch {
        results.set(key, restoreInlineCode(safe, slots));
      }
    }),
  );

  return results;
}
