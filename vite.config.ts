import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser client lives in src/client. `npm run build` writes it to dist/client,
// which the host server then serves to every player on the network.
export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
