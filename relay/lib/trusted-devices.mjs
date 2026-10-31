import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const STUDIO_OWNER = 'saved-studio';
export const DEVICE_LIFETIME = 30 * 86400000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (left, right) => typeof left === 'string' && typeof right === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const label = value => typeof value === 'string' && value.trim() && value.length <= 60 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : 'My browser';
const prune = (state, now) => { state.devices = state.devices.filter(d => d.expires > now); if (state.pairing?.expires <= now) state.pairing = null; };
export class TrustedDevices {
  constructor({ vault, secure = true, now = Date.now }) { this.vault = vault; this.secure = secure; this.now = now; this.cookieName = secure ? '__Host-mk97_device' : 'mk97_local_device'; }
  cookie(value, maxAge = DEVICE_LIFETIME / 1000) {
    return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax${this.secure ? '; Secure' : ''}; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
  }
  clearCookie() { return this.cookie('', 0); }
  readCookie(header = '') {
    if (typeof header !== 'string' || header.length > 8192) return null;
    const matches = header.split(';').map(s => s.trim()).filter(s => s.startsWith(this.cookieName + '='));
    if (matches.length !== 1) return null;
    const value = matches[0].slice(this.cookieName.length + 1);
    return /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  valid(id) {
    if (!this.vault.state) return false;
    return this.vault.state.devices.some(d => d.id === id && d.expires > this.now());
  }
  async authenticate(header) {
    const value = this.readCookie(header); if (!value) return null;
    await this.vault.ready();
    const [id, secret] = value.split('.'), device = this.vault.snapshot().devices.find(d => d.id === id && d.expires > this.now());
    if (!device || !equal(device.hash, hash(secret))) return null;
    // Do not keep an autosleeping database awake just to update a timestamp.
    if (this.now() - device.lastSeen > 6 * 3600000) await this.vault.mutate(s => { const d = s.devices.find(d => d.id === id); if (d) d.lastSeen = this.now(); });
    return { owner: STUDIO_OWNER, deviceId: id, expires: device.expires, name: device.name };
  }
  makeDevice(name) {
    const id = randomBytes(16).toString('hex'), secret = randomBytes(32).toString('base64url'), now = this.now();
    return { value: `${id}.${secret}`, record: { id, hash: hash(secret), name: label(name), created: now, lastSeen: now, expires: now + DEVICE_LIFETIME } };
  }
  async remember(name, existingCookie) {
    const previous = await this.authenticate(existingCookie);
    if (previous) return { ...previous, cookie: null };
    const created = this.makeDevice(name);
    await this.vault.mutate(state => { prune(state, this.now()); if (state.devices.length >= 12) throw fail('Trusted-device limit reached. Remove an old device first.', 409); state.devices.push(created.record); });
    return { owner: STUDIO_OWNER, deviceId: created.record.id, expires: created.record.expires, name: created.record.name, cookie: this.cookie(created.value) };
  }
  async pairing(deviceId) {
    if (!this.valid(deviceId)) throw fail('Sign in on a remembered device before linking another device.', 401);
    const code = randomBytes(8).toString('hex').toUpperCase(), expires = this.now() + 5 * 60000;
    await this.vault.mutate(state => { state.pairing = { hash: hash(code), expires, createdBy: deviceId }; });
    return { code: code.match(/.{4}/g).join('-'), expiresAt: expires };
  }
  async link(value, name) {
    const code = typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
    if (!/^[A-F0-9]{16}$/.test(code)) throw fail('Enter the one-time code shown on your already connected device.');
    const created = this.makeDevice(name);
    await this.vault.mutate(state => {
      prune(state, this.now()); const pair = state.pairing;
      if (!pair || !state.devices.some(d => d.id === pair.createdBy) || !equal(pair.hash, hash(code))) throw fail('The device code is incorrect, expired or already used.', 401);
      if (state.devices.length >= 12) throw fail('Trusted-device limit reached. Remove an old device first.', 409);
      state.pairing = null; state.devices.push(created.record);
    });
    return { owner: STUDIO_OWNER, deviceId: created.record.id, expires: created.record.expires, name: created.record.name, cookie: this.cookie(created.value) };
  }
  async remove(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw fail('Choose a valid remembered device.');
    await this.vault.mutate(state => { state.devices = state.devices.filter(d => d.id !== id); if (state.pairing?.createdBy === id) state.pairing = null; });
  }
  status(currentId) {
    return { remembered: Boolean(currentId && this.valid(currentId)), currentDeviceId: currentId || null,
      devices: this.vault.snapshot().devices.filter(d => d.expires > this.now()).map(({ id, name, created, lastSeen, expires }) => ({ id, name, createdAt: created, lastSeen, expiresAt: expires, current: id === currentId })) };
  }
}
