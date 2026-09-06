// Install before importing lib/storage.ts, which installs the real one at import time.
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
