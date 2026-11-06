import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CBItem } from './types.ts';
import {
  buildCollectionBookStatus,
  type CollectionBookLibraryFile,
  type CollectionBookStatusSnapshot,
  type UpgradeCostsFile,
} from './collectionBookUpgradeCosts.ts';

const DATA_DIR = resolve(process.cwd(), 'data', 'stw');
const LIBRARY_FILE = resolve(DATA_DIR, 'collection-book-library.json');
const CATALOG_FALLBACK = resolve(DATA_DIR, 'collection-book-catalog.json');
const COSTS_FILE = resolve(DATA_DIR, 'upgrade-costs.json');

let cachedLibrary: CollectionBookLibraryFile | null | undefined;
let cachedCosts: UpgradeCostsFile | null | undefined;
let libraryMtime = 0;
let costsMtime = 0;

function readJsonFile<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function fileMtime(file: string): number {
  try {
    return existsSync(file) ? readFileSync(file).length : 0;
  } catch {
    return 0;
  }
}

export class CollectionBookCatalogManager {
  static getLibraryPath(): string {
    return existsSync(LIBRARY_FILE) ? LIBRARY_FILE : CATALOG_FALLBACK;
  }

  static getCostsPath(): string {
    return COSTS_FILE;
  }

  static loadLibrary(force = false): CollectionBookLibraryFile | null {
    const path = CollectionBookCatalogManager.getLibraryPath();
    const stamp = fileMtime(path);
    if (!force && cachedLibrary !== undefined && stamp === libraryMtime) {
      return cachedLibrary;
    }
    libraryMtime = stamp;
    cachedLibrary = readJsonFile<CollectionBookLibraryFile>(path);
    return cachedLibrary;
  }

  static loadUpgradeCosts(force = false): UpgradeCostsFile | null {
    const stamp = fileMtime(COSTS_FILE);
    if (!force && cachedCosts !== undefined && stamp === costsMtime) {
      return cachedCosts;
    }
    costsMtime = stamp;
    cachedCosts = readJsonFile<UpgradeCostsFile>(COSTS_FILE);
    return cachedCosts;
  }

  static isCatalogAvailable(): boolean {
    const library = CollectionBookCatalogManager.loadLibrary();
    return (library?.slots?.length ?? 0) > 0;
  }

  static buildStatus(slottedItems: CBItem[]): CollectionBookStatusSnapshot | null {
    const library = CollectionBookCatalogManager.loadLibrary();
    const costs = CollectionBookCatalogManager.loadUpgradeCosts();
    if (!costs) return null;
    return buildCollectionBookStatus(library, slottedItems, costs, 'c');
  }

  static getMissingSlots(slottedItems: CBItem[]): import('./collectionBookUpgradeCosts.ts').SlotInventoryEntry[] {
    const status = CollectionBookCatalogManager.buildStatus(slottedItems);
    if (!status) return [];
    return status.inventory.filter((row) => row.status === 'missing');
  }
}

export type {
  CollectionBookStatusSnapshot,
  CollectionBookLibraryFile,
  UpgradeCostsFile,
  SlotInventoryEntry,
} from './collectionBookUpgradeCosts.ts';
