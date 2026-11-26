export interface StwLlamaTile {
  templateId: string;
  quantity: number;
}

export function parseStwLlamaTiles(profile: Record<string, unknown>): StwLlamaTile[] {
  const items = profile.items;
  if (!items || typeof items !== 'object') return [];

  const list: StwLlamaTile[] = [];
  const cardMap = new Map<string, StwLlamaTile>();

  for (const item of Object.values(items as Record<string, { templateId?: string; quantity?: number }>)) {
    const tpl = item.templateId ?? '';
    if (tpl.startsWith('AccountResource:voucher_')) {
      const voucherKey = tpl.replace('AccountResource:', '');
      if (!/^voucher_(basicpack|cardpack_)/i.test(voucherKey)) continue;
      const qty = item.quantity ?? 0;
      if (qty <= 0) continue;
      list.push({ templateId: tpl, quantity: qty });
      continue;
    }

    if (!tpl.startsWith('CardPack:')) continue;
    if (tpl.includes('_choice_') || tpl.toLowerCase().includes('choice')) continue;

    const existing = cardMap.get(tpl);
    if (existing) {
      existing.quantity += item.quantity ?? 1;
    } else {
      cardMap.set(tpl, { templateId: tpl, quantity: item.quantity ?? 1 });
    }
  }

  list.push(...cardMap.values());
  return list.sort((a, b) => b.quantity - a.quantity);
}
