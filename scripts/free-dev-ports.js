#!/usr/bin/env node
// Frees this worktree's frontend (Vite) and backend (Express) ports before
// `npm run dev:app` starts, so a stale process left over from a previous run
// (e.g. a crashed/killed terminal) doesn't block the new one with EADDRINUSE.
// Only kills processes bound to THIS worktree's own ports (read from its .env
// and vite.config.js) so other worktrees' dev servers are never touched.
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readEnvPort(name) {
  const envPath = path.join(root, '.env');
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function readEnvUrlPort(name) {
  const value = readEnvPort(name); // same KEY=value format, just holds a URL
  if (!value) return null;
  try {
    return new URL(value).port || null;
  } catch {
    return null;
  }
}

const backendPort = readEnvPort('PORT');
const frontendPort = readEnvUrlPort('FRONTEND_ORIGIN'); // vite.config.js derives its port from this same value
const ports = [frontendPort, backendPort].filter(Boolean);

if (ports.length === 0) {
  process.exit(0);
}

const isWindows = process.platform === 'win32';

for (const port of ports) {
  try {
    if (isWindows) {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const state = parts[3];
        const pid = parts[4];
        // Only match LISTENING sockets on this exact local port (avoid killing
        // unrelated processes that merely have an ephemeral connection to it).
        const localAddr = parts[1] || '';
        const localPort = localAddr.split(':').pop();
        if (state === 'LISTENING' && localPort === String(port) && pid && pid !== '0') {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[free-dev-ports] Killed process ${pid} on port ${port}`);
        } catch {
          // Process may have already exited between the scan and the kill.
        }
      }
    } else {
      const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
      const pids = output.split('\n').map((s) => s.trim()).filter(Boolean);
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          console.log(`[free-dev-ports] Killed process ${pid} on port ${port}`);
        } catch {
          // Process may have already exited between the scan and the kill.
        }
      }
    }
  } catch {
    // No process found on this port (findstr/lsof exit non-zero) - nothing to free.
  }
}
