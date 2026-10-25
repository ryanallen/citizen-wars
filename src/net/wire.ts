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

export interface WorldMsg { tick: number; ack: number; inputs: [Input, Input]; world: Uint8Array }

export function encodeWorld(tick: number, ack: number, inputs: [Input, Input], world: Uint8Array): Uint8Array {
  const b = new Uint8Array(17 + world.length);
  const v = new DataView(b.buffer);
  v.setUint8(0, WORLD);
  v.setUint32(1, tick >>> 0);
  v.setUint32(5, ack >>> 0);
  v.setUint16(9, inputs[0].keys);
  v.setInt16(11, inputs[0].aim);
  v.setUint16(13, inputs[1].keys);
  v.setInt16(15, inputs[1].aim);
  b.set(world, 17);
  return b;
}

export function decodeWorld(b: Uint8Array): WorldMsg | null {
  if (b.length < 17 || b[0] !== WORLD) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    tick: v.getUint32(1),
    ack: v.getUint32(5),
    inputs: [{ keys: v.getUint16(9), aim: v.getInt16(11) }, { keys: v.getUint16(13), aim: v.getInt16(15) }],
    world: b.slice(17),
  };
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
