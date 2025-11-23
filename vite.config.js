import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        accommodations: resolve(__dirname, 'src/pages/accommodations.html'),
        experiences: resolve(__dirname, 'src/pages/experiences.html'),
        dining: resolve(__dirname, 'src/pages/dining.html'),
        gallery: resolve(__dirname, 'src/pages/gallery.html'),
        contact: resolve(__dirname, 'src/pages/contact.html'),
        reservations: resolve(__dirname, 'src/pages/reservations.html'),
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
