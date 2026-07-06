import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '_site/js',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        islands: 'src/islands/index.jsx',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
