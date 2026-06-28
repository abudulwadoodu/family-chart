export function setBaseTestEnv() {
  process.env.DB_PATH = ':memory:';
  process.env.FRONTEND_ORIGIN = 'http://localhost:8080';
  process.env.COGNITO_USER_POOL_ID = 'ap-south-2_test';
  process.env.COGNITO_CLIENT_ID = 'test-client-id';
  process.env.SES_REGION = 'ap-south-2';
  process.env.SES_SENDER_EMAIL = 'no-reply@familychart.app';
  process.env.SES_RECIPIENT_EMAIL = 'support@familychart.app';
  process.env.ADMIN_EMAILS = 'admin@example.com';
}
