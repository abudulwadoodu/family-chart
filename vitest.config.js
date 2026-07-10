import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Loaded here (rather than relying on each test file) so TEST_DATABASE_URL from
// .env reaches process.env before any test file's top-level setBaseTestEnv() call -
// otherwise it's always undefined and every test suite falls back to DATABASE_URL,
// truncating the real dev database.
dotenv.config();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['backend/**/*.test.js', 'frontend/**/*.test.js'],
    fileParallelism: false,
  },
});
