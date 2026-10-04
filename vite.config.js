import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths, so the build works from any subfolder (e.g. GitHub Pages)
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
  preview: { port: 4173 },
});
