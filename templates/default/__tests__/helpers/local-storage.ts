/**
 * In-memory localStorage for node. `lib/storage.ts` installs a real one from
 * expo-sqlite at import time, so any file importing it has to mock
 * "expo-sqlite/localStorage/install" and install this before the import.
 *
 * `backing` is the map behind it, so a test can assert on the raw stored string.
 */
export const backing = new Map<string, string>();

export function installLocalStorage(): void {
  globalThis.localStorage = {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}
