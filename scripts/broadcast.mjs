#!/usr/bin/env node
/**
 * Send a "Tonight nudges & offers" push to everyone who opted in.
 *
 *   node scripts/broadcast.mjs --title "Why wait for the weekend?" --body "Find a date for tonight."
 *   node scripts/broadcast.mjs --title "..." --body "..." --url "/(tabs)/live" --send
 *
 * Without --send it's a dry run that only reports who would get it.
 * Reads BROADCAST_SECRET from functions/.env.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = readFileSync(join(root, 'functions/.env'), 'utf8');
const secret = envFile.match(/^BROADCAST_SECRET=(.+)$/m)?.[1]?.trim();
if (!secret) {
  console.error('BROADCAST_SECRET missing from functions/.env');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const title = flag('title');
const body = flag('body');
const url = flag('url');
const send = args.includes('--send');
if (!title || !body) {
  console.error('Usage: node scripts/broadcast.mjs --title "…" --body "…" [--url "/(tabs)/live"] [--send]');
  process.exit(1);
}
if (title.length > 65 || body.length > 178) {
  console.error('Keep title ≤ 65 and body ≤ 178 characters so it isn’t cut off on the lock screen.');
  process.exit(1);
}

const res = await fetch('https://us-central1-datetoday-e1331.cloudfunctions.net/broadcastPush', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-broadcast-key': secret },
  body: JSON.stringify({ title, body, url, send }),
});
const json = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Failed (${res.status}):`, json.error ?? json);
  process.exit(1);
}
console.log(send ? 'Sent.' : 'Dry run (add --send to deliver):');
console.log(`  opted in:        ${json.optedIn}`);
console.log(`  will receive:    ${json.willReceive}`);
console.log(`  skipped (cap):   ${json.capped}   — already got one in the last 20h`);
console.log(`  skipped (no device): ${json.noDevice}`);
