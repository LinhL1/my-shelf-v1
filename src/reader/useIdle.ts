import { useEffect, useState } from 'react';

const IDLE_MS = 2500;

/** True after a period without pointer movement or keyboard focus changes, while enabled. */
export function useIdle(enabled: boolean) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    const events = ['pointermove', 'pointerdown', 'focusin'] as const;
    events.forEach((name) => window.addEventListener(name, wake));
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
      setIdle(false);
    };
  }, [enabled]);

  return idle;
}
