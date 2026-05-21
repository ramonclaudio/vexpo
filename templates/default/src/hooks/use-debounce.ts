import { useEffect, useState } from "react";

/**
 * Returns a value that lags the input by `delay` milliseconds. Useful for
 * coalescing rapid changes (typing, scroll, etc.) before kicking off a more
 * expensive operation downstream (filtering, fetching, rendering a big list).
 *
 * Each input change resets the timer, so the returned value only updates
 * after `delay` ms have passed without further changes.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
