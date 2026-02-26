import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet:  ['leaflet', 'react-leaflet'],
          antd:     ['antd', '@ant-design/icons'],
          echarts:  ['echarts', 'echarts-for-react'],
        },
      },
    },
  },
});
