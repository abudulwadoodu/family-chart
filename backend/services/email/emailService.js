import { sendEmail as sendViaConsole } from './providers/consoleProvider.js';
import { sendEmail as sendViaSes } from './providers/sesProvider.js';
import { sendEmail as sendViaMemory } from './providers/memoryProvider.js';

const providers = {
  console: sendViaConsole,
  ses: sendViaSes,
  memory: sendViaMemory,
};

export function sendEmail(message) {
  const providerName = process.env.EMAIL_PROVIDER || 'console';
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unknown EMAIL_PROVIDER: ${providerName}`);
  return provider(message);
}
