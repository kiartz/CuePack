import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for flexible deployment on GitHub Pages
  server: {
    host: true, // Ascolta su 0.0.0.0 (accessibile sia da PC che da smartphone in WiFi)
    port: 5173
  }
})