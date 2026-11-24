import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, the dashboard (port 5173) forwards API and WebSocket
// calls to the backend (port 4000), so the browser sees one origin.
const API = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 5173 is often taken by other Vite projects
    proxy: {
      '/simulations': API,
      '/drops': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
