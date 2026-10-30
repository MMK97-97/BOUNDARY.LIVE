import { DESTINATIONS, destinationConfig } from './encoder.mjs';

// Each operator session owns its manual keys. Nothing is written to disk or
// returned through status APIs; expiry/logout destroys the references.
export class SessionDestinations {
  constructor({ validSession }) { this.validSession = validSession; this.owners = new Map(); }
  prune() {
    for (const [owner, entry] of this.owners) if (!this.validSession(owner, entry.origin)) this.owners.delete(owner);
  }
  get(owner) { this.prune(); return this.owners.get(owner)?.destinations || {}; }
  set(owner, origin, value) {
    this.prune();
    if (!this.validSession(owner, origin)) throw Object.assign(new Error('Session expired. Reconnect the cloud studio.'), { status: 401 });
    if (!value || typeof value !== 'object' || !DESTINATIONS.includes(value.id)) throw new Error('Choose YouTube, Facebook or Instagram.');
    if (Object.keys(value).some(key => !['id', 'server', 'key'].includes(key))) throw new Error('Unexpected destination field.');
    if (typeof value.server !== 'string' || typeof value.key !== 'string' || !value.server.trim() || !value.key.trim()) throw new Error('Enter both the RTMPS server address and stream key.');
    const prefix = value.id.toUpperCase();
    const destination = destinationConfig({ [`${prefix}_SERVER`]: value.server, [`${prefix}_KEY`]: value.key })[value.id];
    if (!destination.configured) throw new Error(destination.error || 'Invalid RTMPS destination.');
    if (!this.owners.has(owner) && this.owners.size >= 8) throw Object.assign(new Error('Destination session limit reached.'), { status: 429 });
    const entry = this.owners.get(owner) || { origin, destinations: {} };
    entry.destinations[value.id] = destination; this.owners.set(owner, entry);
    return { ok: true, id: value.id };
  }
  clear(owner, id) {
    if (!DESTINATIONS.includes(id)) throw new Error('Unknown destination.');
    const entry = this.owners.get(owner);
    if (entry) { delete entry.destinations[id]; if (!Object.keys(entry.destinations).length) this.owners.delete(owner); }
    return { ok: true, id };
  }
  forget(owner) { this.owners.delete(owner); }
}
