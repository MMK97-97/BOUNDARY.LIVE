import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = [];
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', '.git', '.openai'].includes(item.name)) continue; const p = path.join(dir, item.name); if (item.isDirectory()) walk(p); else if (p.endsWith('.mjs')) files.push(p); } }
walk('relay'); walk('web'); walk('scripts');
for (const file of files) { const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }); if (r.status !== 0) process.exit(1); }
const html = fs.readFileSync('web/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
const app = fs.readFileSync('web/app.mjs', 'utf8') + fs.readFileSync('web/studio.mjs', 'utf8');
for (const m of app.matchAll(/\$\('([^']+)'\)/g)) if (!ids.includes(m[1])) throw new Error(`Missing UI element ${m[1]}`);
for (const m of html.matchAll(/(?:href|src)="\.\/([^"#]+)"/g)) if (!fs.existsSync(path.join('web', m[1]))) throw new Error(`Missing asset ${m[1]}`);
console.log(`Checked ${files.length} JavaScript modules, ${ids.length} unique UI IDs and local assets.`);
