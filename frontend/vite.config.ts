import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the packaged Electron app can load index.html via file://
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
