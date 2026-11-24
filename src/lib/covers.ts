import { useEffect, useState } from 'react';
import { getCover } from './db';

/** One object URL per cover for the lifetime of the page. */
const urls = new Map<string, Promise<string | null>>();

function coverUrl(id: string) {
  let url = urls.get(id);
  if (!url) {
    url = getCover(id).then(
      (blob) => (blob ? URL.createObjectURL(blob) : null),
      () => {
        urls.delete(id);
        return null;
      },
    );
    urls.set(id, url);
  }
  return url;
}

export function releaseCover(id: string) {
  void urls.get(id)?.then((url) => url && URL.revokeObjectURL(url));
  urls.delete(id);
}

export function useCoverUrl(id: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void coverUrl(id).then((value) => {
      if (active) setUrl(value);
    });
    return () => {
      active = false;
    };
  }, [id]);
  return url;
}
