import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server proxies API + WebSocket calls to the Express backend.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
