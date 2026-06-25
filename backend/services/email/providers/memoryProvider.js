export const sentEmails = [];

export async function sendEmail({ to, subject, text, html }) {
  sentEmails.push({ to, subject, text, html, sentAt: new Date().toISOString() });
  return { ok: true };
}

export function clearSentEmails() {
  sentEmails.length = 0;
}
