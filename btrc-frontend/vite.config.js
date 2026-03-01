import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, statSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── GeoJSON static file server plugin ─────────────────────────────────────────
// Intercepts GET /geodata/* and serves files from the project-root geodata/ dir.
// Required because btrc-frontend/public/ is root-owned by Docker and can't be
// written to locally. This lets both Vite (React map) and Metabase (region map)
// read the GeoJSON without needing to copy files into public/.
//
// Metabase URL (Docker internal network): http://frontend:5173/geodata/...
const serveGeodataPlugin = {
  name: 'serve-geodata',
  configureServer(server) {
    server.middlewares.use('/geodata', (req, res, next) => {
      const geoDir  = resolve(__dirname, '../geodata');
      const filePath = join(geoDir, (req.url || '/').replace(/^\//, ''));

      let stat;
      try { stat = statSync(filePath); } catch { return next(); }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200, { 'Content-Length': stat.size });
      createReadStream(filePath).pipe(res);
    });
  },
};


export default defineConfig({
  plugins: [react(), serveGeodataPlugin],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow requests from Docker internal hostnames (e.g. Metabase fetching GeoJSON)
    allowedHosts: true,
    proxy: {
      // METABASE_PROXY_TARGET  — set to http://metabase:3000 inside Docker
      //                        — defaults to http://localhost:3000 for local dev
      '/api': {
        target: process.env.METABASE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      // TILE_PROXY_TARGET  — set to http://martin:3000 inside Docker
      //                    — defaults to http://localhost:3001 for local dev
      '/tiles': {
        target: process.env.TILE_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
    },
  },
  resolve: {
    alias: {
      // Resolve vendor copy of protomaps-leaflet (ESM build)
      // 'protomaps-leaflet': resolve(__dirname, 'src/vendor/protomaps-leaflet/dist/esm/index.js'),
    },
  },
  optimizeDeps: {
    include: [],
    exclude: [],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet:       ['leaflet', 'react-leaflet'],
          antd:          ['antd', '@ant-design/icons'],
          echarts:       ['echarts', 'echarts-for-react'],
          protomaps:     ['protomaps-leaflet'],
        },
      },
    },
  },
});
