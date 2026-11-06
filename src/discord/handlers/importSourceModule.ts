import { pathToFileURL } from 'node:url';

/** Dynamic import that works with absolute Windows paths (file:// URL). */
export async function importSourceModule<T = unknown>(filePath: string): Promise<T> {
  return import(pathToFileURL(filePath).href) as Promise<T>;
}

/**
 * Kept for the reload commands' API. ES modules cannot be evicted from Node's module cache,
 * so a reload re-registers the already-loaded modules (same behaviour as under tsx before).
 */
export function clearModuleCache(_filePath: string): void {
  // intentionally empty
}
