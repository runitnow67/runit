import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed dev server host/port for IPC; keep defaults simple.
export default defineConfig(() => ({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'es2021'
  }
}));
