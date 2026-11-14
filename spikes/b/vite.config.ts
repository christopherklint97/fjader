import { defineConfig } from 'vite';

// Relative asset paths so the same build works at /b/ and /coi/b/.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm', '@journeyapps/wa-sqlite'] },
});
