import "expo-sqlite/localStorage/install";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function read<T>(key: string, defaultValue: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export type Storage<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createStorage<T>(key: string, defaultValue: T): Storage<T> {
  return {
    get: () => read(key, defaultValue),
    set: (value: T) => {
      localStorage.setItem(key, JSON.stringify(value));
      notify(key);
    },
    subscribe: (listener: Listener) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
        if (set!.size === 0) listeners.delete(key);
      };
    },
  };
}
