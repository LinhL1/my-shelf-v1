import { lazy, Suspense } from 'react';
import { useRoute } from './lib/router';
import { LibraryView } from './library/LibraryView';

// Keeps PDF.js out of the initial bundle.
const ReaderView = lazy(() => import('./reader/ReaderView'));

export function App() {
  const route = useRoute();
  if (route.name === 'library') return <LibraryView />;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-desk" />}>
      <ReaderView key={route.bookId} bookId={route.bookId} />
    </Suspense>
  );
}
