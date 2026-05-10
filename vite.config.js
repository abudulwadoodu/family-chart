import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: resolve(__dirname, 'frontend'),
    base: env.VITE_BASE || '/',
    server: {
      port: 8080,
      proxy: {
        '/api': {
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
