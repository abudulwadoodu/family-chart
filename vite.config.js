import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: resolve(__dirname, 'frontend'),
    envDir: __dirname,
    base: env.VITE_BASE || '/',
    server: {
      // Fixed per-worktree so `npm run dev:app` never collides across worktrees
      // running concurrently: main 8080, ui-enhancements 8081, feature-enhancements
      // 8082 (see FRONTEND_ORIGIN in this worktree's .env). strictPort makes Vite
      // fail fast instead of silently picking a different port when this one is busy.
      port: 8080,
      strictPort: true,
      proxy: {
        '^/api/': {
          target: env.VITE_DEV_API_ORIGIN || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@examples': resolve(__dirname, 'examples'),
      },
    },
    build: {
      outDir: resolve(__dirname, 'dist/app'),
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
