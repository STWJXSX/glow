import type { CosmeticSection } from './cosmeticsConstants.ts';

export interface CosmeticImageRef {
  variant: string;
  url: string;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function walkImageNode(node: unknown, prefix: string, out: Map<string, string>): void {
  if (isHttpUrl(node)) {
    const key = prefix || 'url';
    if (!out.has(key)) out.set(key, node);
    return;
  }

  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    node.forEach((child, index) => walkImageNode(child, prefix ? `${prefix}_${index}` : String(index), out));
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const next = prefix ? `${prefix}_${key}` : key;
    walkImageNode(value, next, out);
  }
}

function sanitizeVariant(variant: string): string {
  return variant.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'image';
}

/** Collect every HTTP image URL exposed by a fortnite-api cosmetic row. */
export function collectCosmeticImageRefs(
  item: Record<string, unknown>,
  section: CosmeticSection,
): CosmeticImageRef[] {
  const out = new Map<string, string>();

  if (section === 'tracks' && isHttpUrl(item.albumArt)) {
    out.set('albumArt', item.albumArt);
  }

  walkImageNode(item.images, '', out);

  return [...out.entries()].map(([variant, url]) => ({
    variant: sanitizeVariant(variant),
    url,
  }));
}

/** Locker tile portrait — small/icon first. */
export function pickPortraitVariant(refs: CosmeticImageRef[], section: CosmeticSection): string | null {
  if (!refs.length) return null;

  const byVariant = new Map(refs.map((r) => [r.variant, r.url]));

  if (section === 'tracks') {
    return byVariant.get('albumArt') ?? refs[0]?.url ?? null;
  }

  if (section === 'cars' || section === 'lego' || section === 'legoKits' || section === 'beans') {
    return (
      byVariant.get('small')
      ?? byVariant.get('large')
      ?? byVariant.get('icon')
      ?? refs[0]?.url
      ?? null
    );
  }

  if (section === 'instruments') {
    return byVariant.get('small') ?? byVariant.get('large') ?? refs[0]?.url ?? null;
  }

  return (
    byVariant.get('icon')
    ?? byVariant.get('smallIcon')
    ?? byVariant.get('small')
    ?? byVariant.get('featured')
    ?? byVariant.get('large')
    ?? refs[0]?.url
    ?? null
  );
}

/** Shop-style hero image — featured/large first. */
export function pickShopVariant(refs: CosmeticImageRef[], section: CosmeticSection): string | null {
  if (!refs.length) return null;

  const byVariant = new Map(refs.map((r) => [r.variant, r.url]));

  if (section === 'tracks') {
    return byVariant.get('albumArt') ?? refs[0]?.url ?? null;
  }

  if (section === 'cars' || section === 'lego' || section === 'legoKits' || section === 'beans' || section === 'instruments') {
    return (
      byVariant.get('large')
      ?? byVariant.get('featured')
      ?? byVariant.get('small')
      ?? byVariant.get('icon')
      ?? refs[0]?.url
      ?? null
    );
  }

  return (
    byVariant.get('featured')
    ?? byVariant.get('large')
    ?? byVariant.get('icon')
    ?? byVariant.get('smallIcon')
    ?? byVariant.get('small')
    ?? refs[0]?.url
    ?? null
  );
}

export function portraitVariantName(refs: CosmeticImageRef[], section: CosmeticSection): string | null {
  const url = pickPortraitVariant(refs, section);
  if (!url) return null;
  return refs.find((r) => r.url === url)?.variant ?? null;
}

export function shopVariantName(refs: CosmeticImageRef[], section: CosmeticSection): string | null {
  const url = pickShopVariant(refs, section);
  if (!url) return null;
  return refs.find((r) => r.url === url)?.variant ?? null;
}
