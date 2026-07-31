import { buildRawEmail, sendRawEmail } from './email.js';

function requireSesConfig() {
  const sender = process.env.SES_SENDER_EMAIL;
  if (!sender) throw new Error('SES_SENDER_EMAIL is not configured');
  return { sender };
}

// No reply-to (unlike joinRequestEmail.js's owner<->sender exchanges) - this
// is an anonymous guest verifying an email address, not a conversation with
// a person on the other end.
export async function sendShareLinkOtpEmail({ to, treeName, code }) {
  const { sender } = requireSesConfig();
  const raw = buildRawEmail({
    from: sender,
    to,
    replyTo: sender,
    subject: `[Family Chart] Your verification code for "${treeName}"`,
    bodyText: `Your verification code is: ${code}\r\n\r\nEnter this code to view the family tree "${treeName}". This code expires in 10 minutes.\r\n\r\nIf you didn't request this, you can ignore this email.`,
  });
  await sendRawEmail(raw);
}
