import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () =>
      setActive(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [ref]);

  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : ref.current?.requestFullscreen();
    request?.catch((error: unknown) => console.warn('Fullscreen was refused', error));
  }, [ref]);

  // Not available on iPhone; the button is hidden there.
  return { active, toggle, supported: document.fullscreenEnabled === true };
}
