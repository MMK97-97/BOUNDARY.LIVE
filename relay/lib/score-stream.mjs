import { createHash } from 'node:crypto';
import { validateIds } from '../../web/score-data.mjs';
const same = (a, b) => a && b && a.clubId === b.clubId && a.matchId === b.matchId;
function fingerprint(snapshot) {
  const score = snapshot.score ? { ...snapshot.score, fetchedAt: 0,
    scorecard: snapshot.score.scorecard ? { ...snapshot.score.scorecard, fetchedAt: 0 } : undefined,
    inningsCards: snapshot.score.inningsCards?.map(c => ({ ...c, fetchedAt: 0 })) } : null;
  return createHash('sha256').update(JSON.stringify({ score, ids: snapshot.ids, error: snapshot.error })).digest('hex');
}
export class ScoreStream {
  constructor({ validSession, snapshot, maxClients = 8 }) {
    this.validSession = validSession; this.snapshot = snapshot; this.maxClients = maxClients; this.clients = new Set();
  }
  open(req, res, identity, origin, ids) {
    ids = validateIds(ids.clubId, ids.matchId);
    if (!same(ids, this.snapshot().ids)) throw new Error('Load this Match ID on the relay before subscribing.');
    if (this.clients.size >= this.maxClients) throw new Error('Score connection limit reached.');
    if ([...this.clients].some(c => c.identity === identity)) throw new Error('This session already has a score connection.');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const client = { res, identity, origin, ids, hash: null };
    this.clients.add(client);
    res.on('close', () => this.clients.delete(client));
    res.on('error', () => this.close(client));
    this.send(client, this.snapshot());
  }
  write(client, event, value) {
    try {
      const data = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
      if (Buffer.byteLength(data) > 524288 || client.res.writableLength > 1048576 || client.res.destroyed) { this.close(client, true); return false; }
      client.res.write(data); return true;
    } catch { this.close(client); return false; }
  }
  send(client, snapshot) {
    if (!this.validSession(client.identity, client.origin)) {
      this.write(client, 'end', { code: 'AUTH_EXPIRED', error: 'Relay session expired. Reconnect the relay.' }); this.close(client); return;
    }
    if (!same(client.ids, snapshot.ids)) {
      this.write(client, 'end', { code: 'MATCH_CHANGED', error: 'Selected match changed on the relay. Reload your Match ID.' }); this.close(client); return;
    }
    const hash = fingerprint(snapshot);
    if (hash !== client.hash) {
      if (this.write(client, 'score', snapshot)) client.hash = hash;
    } else this.write(client, 'freshness', { ids: snapshot.ids, revision: snapshot.revision, fetchedAt: snapshot.score?.fetchedAt, pollSeconds: snapshot.pollSeconds });
  }
  publish(snapshot) { for (const client of [...this.clients]) this.send(client, snapshot); }
  heartbeat() {
    for (const client of [...this.clients]) {
      if (!this.validSession(client.identity, client.origin)) { this.send(client, this.snapshot()); continue; }
      try { if (client.res.writableLength > 1048576 || client.res.destroyed) this.close(client, true); else client.res.write(': heartbeat\n\n'); }
      catch { this.close(client); }
    }
  }
  close(client, force = false) {
    if (!this.clients.delete(client)) return;
    try { if (force && client.res.destroy) client.res.destroy(); else client.res.end(); } catch {}
  }
  closeSession(identity) { for (const c of [...this.clients]) if (c.identity === identity) this.close(c); }
  closeAll() { for (const c of [...this.clients]) this.close(c); }
}
