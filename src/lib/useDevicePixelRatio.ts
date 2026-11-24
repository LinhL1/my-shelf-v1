import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  let query: MediaQueryList;
  const arm = () => {
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener('change', onChange);
  };
  const onChange = () => {
    // The query only matches the old ratio, so it has to be replaced every time.
    query.removeEventListener('change', onChange);
    arm();
    callback();
  };
  arm();
  return () => query.removeEventListener('change', onChange);
}

/** Device pixels per CSS pixel. Changes with browser zoom and when moving between screens. */
export function useDevicePixelRatio() {
  return useSyncExternalStore(subscribe, () => window.devicePixelRatio);
}
