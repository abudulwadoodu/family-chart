import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

let sesClient;

export function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1' });
  }
  return sesClient;
}

// Strips CR/LF so user-controlled values (name, subject, reply-to) can't be
// used to inject extra headers into the raw MIME message.
export function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

export function sanitizeFilename(value) {
  return sanitizeHeaderValue(value).replace(/"/g, "'");
}

export function buildRawEmail({ from, to, replyTo, subject, bodyText, attachment }) {
  const boundary = `----FamilyChart${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

export async function sendRawEmail(raw) {
  await getSesClient().send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw, 'utf8') } }));
}
