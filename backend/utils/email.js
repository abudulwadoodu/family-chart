import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

let sesClient;

function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1' });
  }
  return sesClient;
}

// Strips CR/LF so user-controlled values (name, subject, reply-to) can't be
// used to inject extra headers into the raw MIME message.
function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function sanitizeFilename(value) {
  return sanitizeHeaderValue(value).replace(/"/g, "'");
}

function buildRawEmail({ from, to, replyTo, subject, bodyText, attachment }) {
  const boundary = `----ContactForm${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const headerLines = [
    `From: ${sanitizeHeaderValue(from)}`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Reply-To: ${sanitizeHeaderValue(replyTo)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const bodyLines = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
  ];

  if (attachment) {
    const base64 = attachment.buffer.toString('base64').replace(/(.{76})/g, '$1\r\n');
    const filename = sanitizeFilename(attachment.originalname);
    bodyLines.push(
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.mimetype}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64
    );
  }

  bodyLines.push('', `--${boundary}--`, '');

  return [...headerLines, ...bodyLines].join('\r\n');
}

export async function sendContactEmail({ name, email, subject, message, attachment }) {
  const sender = process.env.SES_SENDER_EMAIL;
  const recipient = process.env.SES_RECIPIENT_EMAIL;
  if (!sender) throw new Error('SES_SENDER_EMAIL is not configured');
  if (!recipient) throw new Error('SES_RECIPIENT_EMAIL is not configured');

  const bodyText = `New contact form submission\r\n\r\nName: ${name}\r\nEmail: ${email}\r\nSubject: ${subject}\r\n\r\nMessage:\r\n${message}`;

  const raw = buildRawEmail({
    from: sender,
    to: recipient,
    replyTo: email,
    subject: `[Family Chart Contact] ${subject} - ${name}`,
    bodyText,
    attachment,
  });

  await getSesClient().send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw, 'utf8') } }));
}
