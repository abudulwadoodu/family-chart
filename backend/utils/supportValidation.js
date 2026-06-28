export const SUPPORT_CATEGORIES = [
  'General Question',
  'Technical Support',
  'Bug Report',
  'Feature Request',
  'Account Issue',
  'Billing',
  'Other',
];

export const SUBJECT_MIN_LENGTH = 3;
export const SUBJECT_MAX_LENGTH = 120;
export const TICKET_MESSAGE_MIN_LENGTH = 20;
export const TICKET_MESSAGE_MAX_LENGTH = 5000;
export const REPLY_MIN_LENGTH = 1;
export const REPLY_MAX_LENGTH = 5000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];

export function validateAttachment(file) {
  if (file && !ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
    return 'Attachments must be an image, PDF, or text file';
  }
  return null;
}

export function validateMessageLength(message, { min, max }) {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (trimmed.length < min || trimmed.length > max) {
    return { error: `Message must be between ${min} and ${max} characters`, trimmed };
  }
  return { error: null, trimmed };
}
