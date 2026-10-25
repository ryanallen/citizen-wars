// Nostr in our own code (ticket, Phase 3): a throwaway key, signed events,
// and relays over WebSocket. The only borrowed code is the curve maths in
// src/vendor/noble-secp256k1.ts.

import { schnorr, utils } from '../vendor/noble-secp256k1';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type Unsigned = Pick<NostrEvent, 'kind' | 'tags' | 'content'> & { created_at?: number };

export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
}

export const hex = (b: Uint8Array): string => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
export const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** NIP-01: the id is the SHA-256 of [0, pubkey, created_at, kind, tags, content]. */
export async function eventId(e: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
  return hex(await sha256(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])));
}

export const now = (): number => Math.floor(Date.now() / 1000);

/** A key made fresh each visit; nothing about it is kept. */
export class Identity {
  readonly pubkey: string;

  private constructor(private secret: Uint8Array) {
    this.pubkey = hex(schnorr.getPublicKey(secret));
  }

  static random(): Identity {
    return new Identity(utils.randomSecretKey());
  }

  async sign(u: Unsigned): Promise<NostrEvent> {
    const base = { pubkey: this.pubkey, created_at: u.created_at ?? now(), kind: u.kind, tags: u.tags, content: u.content };
    const id = await eventId(base);
    const sig = hex(await schnorr.signAsync(unhex(id), this.secret));
    return { ...base, id, sig };
  }
}

/** True when the id matches the content and the signature is the author's. */
export async function verify(e: NostrEvent): Promise<boolean> {
  try {
    if ((await eventId(e)) !== e.id) return false;
    return await schnorr.verifyAsync(unhex(e.sig), unhex(e.id), unhex(e.pubkey));
  } catch {
    return false;
  }
}

/** NIP-40: an event past its expiration tag is ignored, whatever the relay does. */
export function expired(e: NostrEvent, at = now()): boolean {
  const tag = e.tags.find((t) => t[0] === 'expiration');
  return !!tag && Number(tag[1]) <= at;
}

interface Sub { filters: Filter[]; onEvent: (e: NostrEvent) => void; onEose?: () => void }

/** One relay: open, publish, subscribe, close. */
export class Relay {
  private ws: WebSocket | null = null;
  private subs = new Map<string, Sub>();
  private waiting = new Map<string, (ok: boolean, msg: string) => void>();
  private opening: Promise<void> | null = null;
  private nextSub = 0;
  onClose: (() => void) | null = null;

  constructor(readonly url: string, private timeoutMs = 4000) {}

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    if (this.open) return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        this.opening = null;
        reject(e);
        return;
      }
      const timer = setTimeout(() => { ws.close(); this.opening = null; reject(new Error('timeout')); }, this.timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        this.opening = null;
        for (const [id, s] of this.subs) this.send(['REQ', id, ...s.filters]);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        this.opening = null;
        reject(new Error('error'));
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        for (const [, done] of this.waiting) done(false, 'closed');
        this.waiting.clear();
        this.onClose?.();
      };
      ws.onmessage = (m) => this.receive(String(m.data));
    });
    return this.opening;
  }

  private send(msg: unknown): void {
    if (this.open) this.ws!.send(JSON.stringify(msg));
  }

  private receive(text: string): void {
    let msg: unknown[];
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const [type, a, b, c] = msg as [string, string, unknown, unknown];
    if (type === 'EVENT') this.subs.get(a)?.onEvent(b as NostrEvent);
    else if (type === 'EOSE') this.subs.get(a)?.onEose?.();
    else if (type === 'OK') {
      this.waiting.get(a)?.(b === true, String(c ?? ''));
      this.waiting.delete(a);
    } else if (type === 'CLOSED') this.subs.get(a)?.onEose?.();
  }

  /** Publish; resolves with the relay's OK, or false if refused or no answer in time. */
  publish(e: NostrEvent): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.open) return resolve(false);
      const timer = setTimeout(() => { this.waiting.delete(e.id); resolve(false); }, this.timeoutMs);
      this.waiting.set(e.id, (ok) => { clearTimeout(timer); resolve(ok); });
      this.send(['EVENT', e]);
    });
  }

  subscribe(filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void): string {
    const id = `cw${this.nextSub++}`;
    this.subs.set(id, { filters, onEvent, onEose });
    this.send(['REQ', id, ...filters]);
    return id;
  }

  unsubscribe(id: string): void {
    if (this.subs.delete(id)) this.send(['CLOSE', id]);
  }

  disconnect(): void {
    this.subs.clear();
    this.ws?.close();
    this.ws = null;
  }
}

/** Several relays as one: publish to all, subscribe on all, each event once. */
export class Pool {
  readonly relays: Relay[];

  constructor(urls: string[], timeoutMs = 4000) {
    this.relays = urls.map((u) => new Relay(u, timeoutMs));
  }

  /** Open them all; the ones that answer stay. */
  async connect(): Promise<Relay[]> {
    await Promise.allSettled(this.relays.map((r) => r.connect()));
    return this.relays.filter((r) => r.open);
  }

  async publish(e: NostrEvent): Promise<number> {
    const results = await Promise.all(this.relays.filter((r) => r.open).map((r) => r.publish(e)));
    return results.filter(Boolean).length;
  }

  /**
   * Subscribe on every relay. A relay that is down now takes the subscription
   * up when it reconnects; the end of stored events is reported once the relays
   * open now have all answered.
   */
  subscribe(filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void): () => void {
    const seen = new Set<string>();
    const open = this.relays.filter((r) => r.open).length;
    let eoses = 0;
    let reported = false;
    const eose = () => { if (!reported && ++eoses >= open) { reported = true; onEose?.(); } };
    const ids = this.relays.map((r) =>
      [r, r.subscribe(filters, (e) => {
        if (seen.has(e.id)) return;
        seen.add(e.id);
        onEvent(e);
      }, eose)] as const,
    );
    if (!open) { reported = true; onEose?.(); }
    return () => ids.forEach(([r, id]) => r.unsubscribe(id));
  }

  get openCount(): number {
    return this.relays.filter((r) => r.open).length;
  }

  disconnect(): void {
    this.relays.forEach((r) => r.disconnect());
  }
}
