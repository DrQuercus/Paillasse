import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, l'API tourne sur le port 3070 (npm run dev dans server/)
export default defineConfig({
  plugins: [react()],
  // TipTap + ProseMirror pèsent ~700 ko : acceptable pour une appli servie sur le réseau local
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    // (et ce que sert le serveur aux outils connectés : serveur MCP, llms.txt, pont MCP)
    proxy: {
      '/api': 'http://localhost:3070',
      '/mcp': 'http://localhost:3070',
      '/llms.txt': 'http://localhost:3070',
      '/integrations/paillasse-mcp.mjs': 'http://localhost:3070',
      '/.well-known': 'http://localhost:3070',
    },
  },
});
