import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, statSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── PMTiles static file server plugin ─────────────────────────────────────────
// Intercepts GET /pmtiles/* and serves files from ../tiles/ with full
// HTTP Range request support (required by protomaps-leaflet).
const servePmtilesPlugin = {
  name: 'serve-pmtiles',
  configureServer(server) {
    server.middlewares.use('/pmtiles', (req, res, next) => {
      const tilesDir = resolve(__dirname, '../tiles');
      const filePath = join(tilesDir, (req.url || '/').replace(/^\//, ''));

      let stat;
      try { stat = statSync(filePath); } catch { return next(); }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');

      const range = req.headers['range'];
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end   = endStr ? parseInt(endStr, 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Range':  `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': end - start + 1,
        });
        createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': stat.size });
        createReadStream(filePath).pipe(res);
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), servePmtilesPlugin],
  server: {
    host: '0.0.0.0',
    port: 5173,
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
        rewrite: (path) => path,
      },
    },
  },
  resolve: {
    alias: {
      // Resolve vendor copy of protomaps-leaflet (ESM build)
      'protomaps-leaflet': resolve(__dirname, 'src/vendor/protomaps-leaflet/dist/esm/index.js'),
    },
  },
  optimizeDeps: {
    include: [],
    exclude: ['protomaps-leaflet'],
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
