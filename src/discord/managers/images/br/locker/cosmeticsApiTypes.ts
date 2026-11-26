export interface FortniteApiCosmetic {
  id: string;
  name: string;
  rarity: string;
  series: string | null;
  backendType: string;
  iconUrl: string | null;
  added: string | null;
  source: 'br' | 'cars';
}
