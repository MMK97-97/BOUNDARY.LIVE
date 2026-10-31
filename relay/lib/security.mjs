import { randomBytes, timingSafeEqual } from 'node:crypto';
export const constantTimeEquals = (value, secret) => {
  const a = Buffer.from(String(value || '')), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};
export class SessionStore {
  constructor({ now = Date.now, sessionMs = 8 * 3600_000, ticketMs = 30_000 } = {}) {
    this.now = now; this.sessionMs = sessionMs; this.ticketMs = ticketMs;
    this.sessions = new Map(); this.tickets = new Map();
  }
  prune() {
    const now = this.now();
    for (const [key, session] of this.sessions) if (session.expires <= now) this.sessions.delete(key);
    for (const [key, ticket] of this.tickets) if (ticket.expires <= now || !this.sessions.has(ticket.sessionId)) this.tickets.delete(key);
  }
  create(origin, identity = {}) {
    this.prune();
    if (identity.deviceId) {
      const current = [...this.sessions.values()].find(s => s.deviceId === identity.deviceId && s.origin === origin);
      if (current) return current;
    }
    if (this.sessions.size >= 32 || !identity.deviceId && [...this.sessions.values()].filter(s => !s.deviceId).length >= 8) throw new Error('Session limit reached. Disconnect an unused device.');
    const id = randomBytes(32).toString('hex');
    const session = { id, origin, expires: Math.min(this.now() + this.sessionMs, Number.isFinite(identity.expires) ? identity.expires : Infinity),
      ...(identity.owner ? { owner: identity.owner, deviceId: identity.deviceId } : {}) };
    this.sessions.set(id, session); return session;
  }
  get(id, origin) {
    this.prune(); const session = this.sessions.get(id);
    return session && session.origin === origin ? session : null;
  }
  ticket(sessionId, origin) {
    if (!this.get(sessionId, origin)) throw new Error('Session expired. Reconnect the relay.');
    if (this.tickets.size >= 24) throw new Error('Too many pending streaming requests. Wait 30 seconds.');
    const ticket = randomBytes(32).toString('hex');
    this.tickets.set(ticket, { sessionId, origin, expires: this.now() + this.ticketMs }); return ticket;
  }
  consume(ticket, origin) {
    this.prune(); const value = this.tickets.get(ticket);
    this.tickets.delete(ticket); // one attempt only; cannot be replayed
    return value && value.origin === origin ? this.get(value.sessionId, origin) : null;
  }
  revoke(id) { this.sessions.delete(id); this.prune(); }
  revokeDevice(deviceId) {
    const removed = [];
    for (const [id, session] of this.sessions) if (session.deviceId === deviceId) { removed.push(id); this.sessions.delete(id); }
    this.prune(); return removed;
  }
}
