import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir:     'dist',
    sourcemap:  false,
    minify:     'esbuild',
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port:  3000,
    proxy: {
      '/api':      { target: 'http://localhost:8080', changeOrigin: true },
      '/socket.io':{ target: 'ws://localhost:8080',   ws: true },
    },
  },
  optimizeDeps: {
    include: ['three', 'socket.io-client'],
  },
});
