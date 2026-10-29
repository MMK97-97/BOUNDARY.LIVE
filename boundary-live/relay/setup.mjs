import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('.env', import.meta.url));
if (fs.existsSync(file)) {
  console.log('relay/.env already exists; it was preserved. Edit it in your text editor.');
} else {
  const example = fs.readFileSync(new URL('.env.example', import.meta.url), 'utf8');
  fs.writeFileSync(file, example.replace('REPLACE_WITH_A_RANDOM_TOKEN_AT_LEAST_32_CHARACTERS', randomBytes(32).toString('hex')), { mode: 0o600 });
  console.log('Created relay/.env with a random token. Open it to set your GitHub origin and platform stream URLs/keys.');
}
