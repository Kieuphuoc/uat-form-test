import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3060,
    proxy: {
      '/api': {
        target: 'http://localhost:5600',
        changeOrigin: true,
      },
    },
  },
});
