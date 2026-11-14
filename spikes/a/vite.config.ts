import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build can be served from any sub-path (phone demo host).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
})
