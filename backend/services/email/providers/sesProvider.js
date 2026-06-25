import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

let sesClient;

function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return sesClient;
}

export async function sendEmail({ to, subject, text, html }) {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) throw new Error('EMAIL_FROM is not configured');

  const command = new SendEmailCommand({
    Source: fromAddress,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: { Data: text, Charset: 'UTF-8' },
        ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
      },
    },
  });

  await getSesClient().send(command);
  return { ok: true };
}
