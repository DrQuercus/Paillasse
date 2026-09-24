import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, l'API tourne sur le port 3070 (npm run dev dans server/)
export default defineConfig({
  plugins: [react()],
  // TipTap + ProseMirror pèsent ~700 ko : acceptable pour une appli servie sur le réseau local
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3070' },
  },
});
