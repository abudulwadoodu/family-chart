export async function sendEmail({ to, subject, text }) {
  console.log(`[email:console] to=${to} subject="${subject}"\n${text}`);
  return { ok: true };
}
