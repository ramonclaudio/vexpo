import "expo-sqlite/localStorage/install";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isOneOf<const T extends readonly string[]>(
  ...values: T
): (value: unknown) => value is T[number] {
  return (value: unknown): value is T[number] => values.some((v) => v === value);
}

function read<T>(key: string, defaultValue: T, isValid: (value: unknown) => value is T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return defaultValue;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

export type Storage<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createStorage<T>(
  key: string,
  defaultValue: T,
  isValid: (value: unknown) => value is T,
): Storage<T> {
  return {
    get: () => read(key, defaultValue, isValid),
    set: (value: T) => {
      localStorage.setItem(key, JSON.stringify(value));
      notify(key);
    },
    subscribe: (listener: Listener) => {
      const set = listeners.get(key) ?? new Set<Listener>();
      listeners.set(key, set);
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
  };
}
