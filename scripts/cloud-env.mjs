// Makes only the operator's private cloud configuration. Never prints the token.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deploy/cloud');
const host = (process.argv[2] || '').trim().toLowerCase();
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(host)) {
  console.error('Usage: node scripts/cloud-env.mjs your-real-hostname.duckdns.org'); process.exit(1);
}
const file = path.join(dir, '.env');
try {
  fs.writeFileSync(file, `PUBLIC_HOST=${host}\nRELAY_TOKEN=${randomBytes(32).toString('hex')}\nSTUDIO_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nYOUTUBE_REDIRECT_URI=\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created deploy/cloud/.env with independent private access and encryption keys. Existing files are never overwritten.');
} catch (e) {
  if (e.code === 'EEXIST') { console.error('deploy/cloud/.env already exists and was preserved.'); process.exit(1); }
  throw e;
}
