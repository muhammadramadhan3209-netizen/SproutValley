import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2019',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    minify: 'esbuild',
    cssCodeSplit: false
  },
  server: {
    host: true,
    port: 5173,
    open: false
  }
});