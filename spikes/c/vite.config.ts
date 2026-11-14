import { defineConfig } from 'vite'

// Relative base so the build can be served from any sub-path (phone demo host).
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
})
