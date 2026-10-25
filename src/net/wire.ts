// The small binary messages on the fast channel (ticket, Phase 3).
//   input  [1][u32 seq][u16 keys][i16 aim]                          9 bytes
//   world  [2][u32 tick][u32 ack][u16 keys0][i16 aim0][u16 keys1][i16 aim1][world...]
// ack is the last input of this client's the host has used, so the client
// re-runs only the inputs after it.
// Anything else is JSON on the reliable channel.

import type { Input } from '../sim/input';

export const INPUT = 1;
export const WORLD = 2;

export function encodeInput(seq: number, input: Input): Uint8Array {
  const b = new Uint8Array(9);
  const v = new DataView(b.buffer);
  v.setUint8(0, INPUT);
  v.setUint32(1, seq >>> 0);
  v.setUint16(5, input.keys);
  v.setInt16(7, input.aim);
  return b;
}

export function decodeInput(b: Uint8Array): { seq: number; input: Input } | null {
  if (b.length < 9 || b[0] !== INPUT) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { seq: v.getUint32(1), input: { keys: v.getUint16(5), aim: v.getInt16(7) } };
}

export interface WorldMsg { tick: number; ack: number; inputs: Input[]; world: Uint8Array }

/** [2][u32 tick][u32 ack][u8 n][n × (u16 keys, i16 aim)][world...] */
export function encodeWorld(tick: number, ack: number, inputs: Input[], world: Uint8Array): Uint8Array {
  const head = 10 + inputs.length * 4;
  const b = new Uint8Array(head + world.length);
  const v = new DataView(b.buffer);
  v.setUint8(0, WORLD);
  v.setUint32(1, tick >>> 0);
  v.setUint32(5, ack >>> 0);
  v.setUint8(9, inputs.length);
  inputs.forEach((inp, n) => { v.setUint16(10 + n * 4, inp.keys); v.setInt16(12 + n * 4, inp.aim); });
  b.set(world, head);
  return b;
}

export function decodeWorld(b: Uint8Array): WorldMsg | null {
  if (b.length < 10 || b[0] !== WORLD) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = v.getUint8(9);
  const inputs: Input[] = [];
  for (let k = 0; k < n; k++) inputs.push({ keys: v.getUint16(10 + k * 4), aim: v.getInt16(12 + k * 4) });
  return { tick: v.getUint32(1), ack: v.getUint32(5), inputs, world: b.slice(10 + n * 4) };
}

/** Reliable-channel messages. */
export type Control =
  | { t: 'hello'; callsign: string; pubkey: string }
  | { t: 'welcome'; side: number; roster: Member[] }
  | { t: 'roster'; roster: Member[] }
  | { t: 'full' }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  | { t: 'handover'; to: string; tick: number; world: string }
  | { t: 'bye' }
  | { t: 'relay-for'; pubkey: string; callsign: string }
  | { t: 'relayed'; from: string; data: string };

/** A player in a system, oldest first by `joined`. */
export interface Member { pubkey: string; callsign: string; side: number; joined: number }

export const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
