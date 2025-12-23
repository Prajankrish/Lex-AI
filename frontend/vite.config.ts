import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const apiBase = env.VITE_API_BASE_URL || 'http://127.0.0.1:5000';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // proxy /api to backend
        '/api': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
        // proxy /auth to backend (for authentication endpoints)
        '/auth': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    }
  };
});
