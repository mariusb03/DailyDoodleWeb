import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    host: "0.0.0.0",   // binds IPv4 (and usually makes it reachable in more cases)
    port: 5173,
    strictPort: true,
  },
});