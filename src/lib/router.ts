import { useSyncExternalStore } from 'react';

/** Hash routing keeps refresh and the browser back button working with no server setup. */
export type Route = { name: 'library' } | { name: 'reader'; bookId: string };

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const bookId = /^#\/read\/([\w-]+)$/.exec(hash)?.[1];
  return bookId ? { name: 'reader', bookId } : { name: 'library' };
}

export function openBook(id: string) {
  window.location.hash = `/read/${id}`;
}

export function openLibrary() {
  window.location.hash = '/';
}
