import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, createHash, X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rootCertificates } from 'node:tls';

const MAX = 1_500_000;
const fresh = () => ({ schema: 1, account: null, devices: [], pairing: null, profile: { destinations: {}, youtube: null, preferences: {} } });
export const storageError = message => Object.assign(new Error(message || 'Saved studio storage is unavailable. Check DATABASE_URL and STUDIO_ENCRYPTION_KEY in your hosting settings.'), { status: 503, code: 'STORAGE_UNAVAILABLE' });
export function encryptionKey(value) {
  if (typeof value !== 'string') throw storageError('Set a private STUDIO_ENCRYPTION_KEY containing 32 random bytes as hexadecimal or base64.');
  const key = /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : /^[A-Za-z0-9+/_-]{43}=?$/.test(value) ? Buffer.from(value, 'base64') : null;
  if (key?.length !== 32) throw storageError('STUDIO_ENCRYPTION_KEY must contain 32 random bytes as hexadecimal or base64. Keep the same key after deployment.');
  return key;
}
export function seal(value, key) {
  const plaintext = Buffer.from(JSON.stringify(value));
  if (plaintext.length > MAX) throw storageError('Saved studio data exceeds its storage limit.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('mk97.studio.v1'));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
}
export function unseal(blob, key) {
  try {
    if (typeof blob !== 'string' || blob.length > MAX * 1.5) throw new Error();
    const value = JSON.parse(blob);
    if (value.v !== 1 || typeof value.iv !== 'string' || typeof value.tag !== 'string' || typeof value.data !== 'string') throw new Error();
    const iv = Buffer.from(value.iv, 'base64'), tag = Buffer.from(value.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(Buffer.from('mk97.studio.v1')); decipher.setAuthTag(tag);
    const result = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString());
    if (result.schema !== 1 || !Array.isArray(result.devices) || result.devices.length > 16 || !result.profile || typeof result.profile !== 'object') throw new Error();
    return result;
  } catch { throw storageError('Saved studio data cannot be unlocked. Restore the original STUDIO_ENCRYPTION_KEY; existing saved data has not been replaced.'); }
}

/** A single encrypted row. CAS protects another writer from losing updates. */
export class StudioVault {
  constructor({ adapter, key }) { this.adapter = adapter; this.key = Buffer.isBuffer(key) ? key : encryptionKey(key); this.state = null; this.revision = 0; this.queue = Promise.resolve(); this.loading = null; }
  async ready() {
    if (this.state) return;
    if (!this.loading) this.loading = this.reload().finally(() => { this.loading = null; });
    await this.loading;
  }
  async reload() {
    let row;
    try { row = await this.adapter.read(); } catch { throw storageError(); }
    const next = row ? unseal(row.sealed, this.key) : fresh();
    this.state = next; this.revision = row?.revision || 0;
  }
  snapshot() { if (!this.state) throw storageError(); return structuredClone(this.state); }
  mutate(change) {
    const operation = this.queue.then(async () => {
      await this.ready();
      for (let attempt = 0; attempt < 4; attempt++) {
        const next = this.snapshot(), result = change(next), sealed = seal(next, this.key);
        let saved;
        try { saved = await this.adapter.compareAndSet(this.revision, sealed); } catch { throw storageError(); }
        if (saved) { this.state = next; this.revision++; return result; }
        await this.reload();
      }
      throw storageError('Saved studio changed in another process. Try the operation again.');
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  async close() { await this.queue; await this.adapter.close?.(); }
}

/** For an owned server with a real persistent volume; never a Render Free fallback. */
export class FileVaultAdapter {
  constructor(filename) { this.filename = path.resolve(filename); this.lock = this.filename + '.lock'; }
  async read() {
    try {
      const stat = await fs.stat(this.filename); if (stat.size > MAX * 1.5) throw storageError();
      const row = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (!Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.sealed !== 'string') throw storageError();
      return row;
    } catch (e) { if (e.code === 'ENOENT') return null; throw storageError(); }
  }
  async compareAndSet(revision, sealed) {
    await fs.mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    let lock;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { lock = await fs.open(this.lock, 'wx', 0o600); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    if (!lock) throw storageError('Saved studio storage is busy. Check that only one server instance owns this file.');
    const temporary = this.filename + '.' + randomBytes(8).toString('hex') + '.next';
    try {
      const current = await this.read(); if ((current?.revision || 0) !== revision) return false;
      const output = await fs.open(temporary, 'wx', 0o600);
      try { await output.writeFile(JSON.stringify({ revision: revision + 1, sealed })); await output.sync(); } finally { await output.close(); }
      await fs.rename(temporary, this.filename); return true;
    } finally { await fs.rm(temporary, { force: true }); await lock.close(); await fs.rm(this.lock, { force: true }); }
  }
}

function certificateAuthority(value) {
  if (!value) return null;
  try {
    if (typeof value !== 'string' || value.length > 48000) throw new Error();
    const pem = value.replace(/\\n/g, '\n').trim(), blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!blocks?.length || blocks.length > 8 || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) throw new Error();
    if (blocks.some(block => !new X509Certificate(block).ca)) throw new Error();
    return blocks.join('\n') + '\n';
  } catch { throw storageError('DATABASE_CA_CERT must contain the PEM root certificate downloaded from your database provider. Certificate verification remains enabled.'); }
}
export function postgresOptions(input, caCertificate) {
  const ca = certificateAuthority(caCertificate);
  try {
    const u = new URL(input);
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname || !u.username || !u.password || u.hash || input.length > 8192) throw new Error();
    // pg URL SSL options replace the explicit ssl object. Remove them so neither
    // sslmode=require nor an operator typo can disable certificate verification.
    for (const field of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'sslnegotiation', 'channel_binding']) u.searchParams.delete(field);
    return { connectionString: u.href, ssl: { rejectUnauthorized: true, ...(ca ? { ca: [...rootCertificates, ca] } : {}) }, enableChannelBinding: true,
      max: 2, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, query_timeout: 10000, allowExitOnIdle: true };
  } catch { throw storageError('DATABASE_URL must be a PostgreSQL connection URL. Its value is private and is never displayed by MK97.'); }
}
export class PostgresVaultAdapter {
  constructor(pool) { this.pool = pool; this.initialized = null; }
  async init() {
    // One atomic schema upgrade. API roles must never reach encrypted state,
    // including on Supabase projects that automatically grant new public tables.
    if (!this.initialized) this.initialized = this.pool.query(`DO $mk97$
      DECLARE api_role text;
      BEGIN
        PERFORM pg_catalog.pg_advisory_xact_lock(72297971);
        CREATE SCHEMA IF NOT EXISTS mk97_private;
        IF pg_catalog.to_regclass('public.mk97_private_state') IS NOT NULL THEN
          IF pg_catalog.to_regclass('mk97_private.studio_state') IS NOT NULL THEN
            RAISE EXCEPTION 'Both legacy and private studio tables exist. Review the database before continuing.';
          END IF;
          ALTER TABLE public.mk97_private_state SET SCHEMA mk97_private;
          ALTER TABLE mk97_private.mk97_private_state RENAME TO studio_state;
        END IF;
        CREATE TABLE IF NOT EXISTS mk97_private.studio_state (slot TEXT PRIMARY KEY, revision BIGINT NOT NULL, sealed TEXT NOT NULL);
        ALTER TABLE mk97_private.studio_state ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON SCHEMA mk97_private FROM PUBLIC;
        REVOKE ALL ON TABLE mk97_private.studio_state FROM PUBLIC;
        FOR api_role IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
          EXECUTE format('REVOKE ALL ON SCHEMA mk97_private FROM %I', api_role);
          EXECUTE format('REVOKE ALL ON TABLE mk97_private.studio_state FROM %I', api_role);
        END LOOP;
      END $mk97$`).catch(e => { this.initialized = null; throw e; });
    await this.initialized;
  }
  async read() {
    await this.init(); const result = await this.pool.query('SELECT revision, sealed FROM mk97_private.studio_state WHERE slot = $1', ['studio']);
    if (!result.rows.length) return null;
    const revision = Number(result.rows[0].revision);
    if (!Number.isSafeInteger(revision) || revision < 1) throw storageError();
    return { revision, sealed: result.rows[0].sealed };
  }
  async compareAndSet(revision, sealed) {
    await this.init();
    const result = revision === 0 ? await this.pool.query('INSERT INTO mk97_private.studio_state (slot, revision, sealed) VALUES ($1, $2, $3) ON CONFLICT (slot) DO NOTHING', ['studio', 1, sealed]) :
      await this.pool.query('UPDATE mk97_private.studio_state SET revision = revision + 1, sealed = $1 WHERE slot = $2 AND revision = $3', [sealed, 'studio', revision]);
    return result.rowCount === 1;
  }
  async close() { await this.pool.end(); }
}

export async function configuredVault(env = {}) {
  if (!env.DATABASE_URL && !env.STUDIO_DATA_FILE) return { vault: null, configured: false, backend: null,
    message: 'Enable saved devices once on the host: add DATABASE_URL and a private STUDIO_ENCRYPTION_KEY. See docs/SAVED_STUDIO.md.' };
  const key = encryptionKey(env.STUDIO_ENCRYPTION_KEY);
  let adapter, backend;
  if (env.DATABASE_URL) {
    const { Pool } = await import('pg'); const pool = new Pool(postgresOptions(env.DATABASE_URL, env.DATABASE_CA_CERT));
    pool.on('error', () => {}); adapter = new PostgresVaultAdapter(pool); backend = 'postgres';
  } else {
    if (env.RENDER_EXTERNAL_URL) throw storageError('Render needs DATABASE_URL for durable saved devices. Local files on a free Render service are temporary.');
    const filename = path.resolve(env.STUDIO_DATA_FILE), webRoot = path.resolve(fileURLToPath(new URL('../../web', import.meta.url)));
    if (filename === webRoot || filename.startsWith(webRoot + path.sep)) throw storageError('Place STUDIO_DATA_FILE outside the public web directory.');
    adapter = new FileVaultAdapter(filename); backend = 'file';
  }
  const vault = new StudioVault({ adapter, key });
  return { vault, configured: true, backend, message: null, keyId: createHash('sha256').update(key).digest('hex').slice(0, 16) };
}
