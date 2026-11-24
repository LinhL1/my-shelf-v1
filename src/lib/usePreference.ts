import { useState } from 'react';

/** A small UI preference remembered in localStorage. */
export function usePreference<T extends string>(name: string, options: readonly T[], fallback: T) {
  const key = `my-shelf:${name}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored && options.includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Preferences are optional.
    }
  };
  return [value, update] as const;
}
