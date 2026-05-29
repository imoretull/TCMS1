import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the React app runs on port 5173 and proxies /api to the
// Express server on port 4000. In production, Express serves the built
// files from client/dist and there is no proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
