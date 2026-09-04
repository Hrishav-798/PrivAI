/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/service-worker.js';
          if (chunkInfo.name === 'content') return 'content/content-script.js';
          return '[name]/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: process.env.NODE_ENV === 'production',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  publicDir: 'public',
  test: {
    environment: 'jsdom',
  },
});
