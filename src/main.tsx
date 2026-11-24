import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LibraryProvider } from './lib/LibraryProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LibraryProvider>
      <App />
    </LibraryProvider>
  </StrictMode>,
);
