import { buildRawEmail, sendRawEmail } from './email.js';

function requireSesConfig() {
  const sender = process.env.SES_SENDER_EMAIL;
  const recipient = process.env.SES_RECIPIENT_EMAIL;
  if (!sender) throw new Error('SES_SENDER_EMAIL is not configured');
  if (!recipient) throw new Error('SES_RECIPIENT_EMAIL is not configured');
  return { sender, recipient };
}

function ticketLink(ticket) {
  const origin = (process.env.FRONTEND_ORIGIN || '').replace(/\/+$/, '');
  return `${origin}/?ticket=${encodeURIComponent(ticket.ticket_number)}`;
}

async function send({ to, replyTo, subject, bodyText, attachment }) {
  const { sender } = requireSesConfig();
  const raw = buildRawEmail({ from: sender, to, replyTo, subject, bodyText, attachment });
  await sendRawEmail(raw);
}

export async function sendTicketCreatedEmail({ ticket, userEmail, message, attachment }) {
  const { recipient } = requireSesConfig();
  const link = ticketLink(ticket);

  await send({
    to: userEmail,
    replyTo: recipient,
    subject: `[Family Chart Support] We received your request (${ticket.ticket_number})`,
    bodyText: `Hi,\r\n\r\nThanks for contacting Family Chart support. Your ticket ${ticket.ticket_number} ("${ticket.subject}") has been created and our team will respond soon.\r\n\r\nView your ticket: ${link}`,
  });

  await send({
    to: recipient,
    replyTo: userEmail,
    subject: `[Family Chart Support] New ticket ${ticket.ticket_number}: ${ticket.subject}`,
    bodyText: `New support ticket from ${userEmail}\r\n\r\nCategory: ${ticket.category}\r\nPriority: ${ticket.priority}\r\n\r\nMessage:\r\n${message}\r\n\r\nView: ${link}`,
    attachment,
  });
}

// From a signed-out visitor via the public /support page - there's no
// ticket/user row for this, so it's relayed straight to the support inbox
// with the visitor's email set as Reply-To.
export async function sendPublicContactEmail({ fromEmail, subject, category, message, attachment }) {
  const { recipient } = requireSesConfig();

  await send({
    to: recipient,
    replyTo: fromEmail,
    subject: `[Family Chart Support] New message from ${fromEmail}: ${subject}`,
    bodyText: `New contact form submission from a signed-out visitor.\r\n\r\nFrom: ${fromEmail}\r\nCategory: ${category}\r\n\r\nMessage:\r\n${message}`,
    attachment,
  });
}

export async function sendAdminReplyEmail({ ticket, userEmail, message, attachment }) {
  const { recipient } = requireSesConfig();
  const link = ticketLink(ticket);

  await send({
    to: userEmail,
    replyTo: recipient,
    subject: `[Family Chart Support] New reply on ${ticket.ticket_number}`,
    bodyText: `Support replied to your ticket ${ticket.ticket_number} ("${ticket.subject}"):\r\n\r\n${message}\r\n\r\nView and reply: ${link}`,
    attachment,
  });
}

export async function sendUserReplyEmail({ ticket, userEmail, recipientEmail, message, attachment }) {
  const { recipient } = requireSesConfig();
  const link = ticketLink(ticket);

  await send({
    to: recipientEmail || recipient,
    replyTo: userEmail,
    subject: `[Family Chart Support] ${userEmail} replied on ${ticket.ticket_number}`,
    bodyText: `${userEmail} replied to ticket ${ticket.ticket_number} ("${ticket.subject}"):\r\n\r\n${message}\r\n\r\nView: ${link}`,
    attachment,
  });
}

export async function sendTicketResolvedEmail({ ticket, userEmail }) {
  const { recipient } = requireSesConfig();
  const link = ticketLink(ticket);

  await send({
    to: userEmail,
    replyTo: recipient,
    subject: `[Family Chart Support] Ticket ${ticket.ticket_number} resolved`,
    bodyText: `Your ticket ${ticket.ticket_number} ("${ticket.subject}") has been marked as resolved. If this doesn't fully address your issue, reply on the ticket and we'll take another look.\r\n\r\nView: ${link}`,
  });
}

export async function sendTicketClosedEmail({ ticket, userEmail }) {
  const { recipient } = requireSesConfig();
  const link = ticketLink(ticket);

  await send({
    to: userEmail,
    replyTo: recipient,
    subject: `[Family Chart Support] Ticket ${ticket.ticket_number} closed`,
    bodyText: `Your ticket ${ticket.ticket_number} ("${ticket.subject}") has been closed.\r\n\r\nView: ${link}`,
  });
}
