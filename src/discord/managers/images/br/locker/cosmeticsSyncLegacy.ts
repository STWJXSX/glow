import type { CosmeticSection } from './cosmeticsConstants.ts';

export function relativePortraitPath(section: CosmeticSection, id: string): string {
  return `${section}/${id.toLowerCase()}.webp`;
}
