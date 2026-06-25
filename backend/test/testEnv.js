export function setBaseTestEnv() {
  process.env.DB_PATH = ':memory:';
  process.env.EMAIL_PROVIDER = 'memory';
  process.env.FRONTEND_ORIGIN = 'http://localhost:8080';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
}
