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
      // Deliberately different from the main worktree's 8080 so both can run
      // `npm run dev:app` at the same time without colliding on a port (see
      // FRONTEND_ORIGIN in this worktree's .env, which already expects 8081).
      port: 8081,
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
