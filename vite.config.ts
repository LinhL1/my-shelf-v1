import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The library lives in IndexedDB, which is scoped to scheme + host + port.
// Dev and preview share one fixed port so both see the same books.
const server = { port: 5280, strictPort: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server,
  preview: server,
});
