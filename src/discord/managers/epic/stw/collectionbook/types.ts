/** Collection Book item shapes returned by glow-core. */

/** Normalised rarity key used throughout the collection book. */
export type Rarity = 'c' | 'uc' | 'r' | 'vr' | 'sr' | 'ur';

/** High-level item type */
export type CBItemType = 'Hero' | 'Survivor' | 'Manager' | 'Defender' | 'Weapon' | 'Trap' | 'Page';

export interface CBItem {
  /** Profile item GUID */
  itemId: string;
  /** Full templateId, e.g. "Schematic:sid_assault_auto_vt_sr_ore_t05" */
  templateId: string;
  /** Item type derived from templateId prefix */
  type: CBItemType;
  /** Rarity key (c / uc / r / vr / sr / ur) */
  rarity: Rarity;
  /** Original rarity string from attributes.starting_rarity */
  rarityRaw: string;
  /** Level inside the collection book */
  level: number;
  /** Evolution tier / star band inferred from templateId or level */
  tier: number;
  /** Power level equivalent (via nivelesReales table) */
  power: number;
  /** Which profile this item belongs to */
  profile: 'collection_book_people0' | 'collection_book_schematics0';
  /** Section strings this item contributes to (populated from CollectionBookPage items) */
  sections: string[];
  /** All raw attributes */
  attributes: Record<string, any>;
}

/** A resolved CollectionBookPage entry */
export interface CBSection {
  pageTemplateId: string;
  sections: Array<{ section: string; state: string }>;
  state: string;
}

/** Result of fetchCollectionBook */
export interface CollectionBookData {
  items: CBItem[];
  sections: CBSection[];
}

/** Filters for listItems */
export interface CBFilter {
  type?: CBItemType | CBItemType[];
  rarity?: Rarity | Rarity[];
  section?: string;
  /** Minimum power level (inclusive) */
  minPower?: number;
  /** Maximum power level (inclusive) */
  maxPower?: number;
  /** Minimum raw level (inclusive) */
  minLevel?: number;
  /** Maximum raw level (inclusive) */
  maxLevel?: number;
}
