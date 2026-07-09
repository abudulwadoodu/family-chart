import { buildRawEmail, sendRawEmail } from './email.js';

function requireSesConfig() {
  const sender = process.env.SES_SENDER_EMAIL;
  if (!sender) throw new Error('SES_SENDER_EMAIL is not configured');
  return { sender };
}

function manageRequestsLink() {
  const origin = (process.env.FRONTEND_ORIGIN || '').replace(/\/+$/, '');
  return `${origin}/?dashboardView=manageRequests`;
}

function myRequestsLink() {
  const origin = (process.env.FRONTEND_ORIGIN || '').replace(/\/+$/, '');
  return `${origin}/?dashboardView=myRequests`;
}

async function send({ to, replyTo, subject, bodyText }) {
  const { sender } = requireSesConfig();
  const raw = buildRawEmail({ from: sender, to, replyTo, subject, bodyText });
  await sendRawEmail(raw);
}

export async function sendJoinRequestCreatedEmail({ ownerEmail, senderEmail, treeName, roleRequested, message }) {
  const link = manageRequestsLink();
  const messageBlock = message ? `\r\n\r\nTheir message:\r\n${message}` : '';

  await send({
    to: ownerEmail,
    replyTo: senderEmail,
    subject: `[Family Chart] ${senderEmail} wants to join "${treeName}"`,
    bodyText: `${senderEmail} has requested ${roleRequested} access to your family tree "${treeName}".${messageBlock}\r\n\r\nReview this request: ${link}`,
  });
}

export async function sendRoleChangeRequestCreatedEmail({ ownerEmail, senderEmail, treeName, currentRole, roleRequested, message }) {
  const link = manageRequestsLink();
  const messageBlock = message ? `\r\n\r\nTheir message:\r\n${message}` : '';

  await send({
    to: ownerEmail,
    replyTo: senderEmail,
    subject: `[Family Chart] ${senderEmail} wants ${roleRequested} access to "${treeName}"`,
    bodyText: `${senderEmail} is currently a ${currentRole} on your family tree "${treeName}" and has requested to be changed to ${roleRequested}.${messageBlock}\r\n\r\nReview this request: ${link}`,
  });
}

export async function sendJoinRequestDecidedEmail({ senderEmail, ownerEmail, treeName, roleRequested, decision, requestType = 'join' }) {
  const link = myRequestsLink();
  const isApproved = decision === 'approved';
  const isRoleChange = requestType === 'role_change';
  const subjectVerb = isRoleChange ? `role change request for "${treeName}"` : `request to join "${treeName}"`;
  const bodyText = isRoleChange
    ? isApproved
      ? `Your request to change your role on "${treeName}" to ${roleRequested} has been approved.\r\n\r\nOpen your trees: ${link}`
      : `Your request to change your role on "${treeName}" to ${roleRequested} was declined by the tree owner. Your current access is unchanged.\r\n\r\nView your requests: ${link}`
    : isApproved
      ? `Your request for ${roleRequested} access to "${treeName}" has been approved. You now have access to the tree.\r\n\r\nOpen your trees: ${link}`
      : `Your request for ${roleRequested} access to "${treeName}" was declined by the tree owner.\r\n\r\nView your requests: ${link}`;

  await send({
    to: senderEmail,
    replyTo: ownerEmail,
    subject: `[Family Chart] Your ${subjectVerb} was ${isApproved ? 'approved' : 'declined'}`,
    bodyText,
  });
}
