/**
 * The DOS game's random numbers (original.md, Hyperspace): six bytes, a new
 * byte = s1 + s4 + s5 + 1 with carries, the bytes shifted up one. Returns a
 * 16-bit value: the new byte low, s2 high.
 */
export class Rng {
  private s = new Uint8Array(6);

  constructor(seed: number) {
    this.s[1] = seed & 255;
    this.s[2] = (seed >>> 8) & 255;
    this.s[3] = (seed >>> 16) & 255;
    this.s[4] = (seed >>> 24) & 255;
  }

  next(): number {
    const s = this.s;
    let sum = s[1] + s[4] + 1;
    const carry = sum >> 8;
    sum = (sum & 255) + s[5] + carry;
    s[0] = sum & 255;
    for (let i = 5; i >= 1; i--) s[i] = s[i - 1];
    return s[0] | (s[2] << 8);
  }

  /** Signed 16-bit, as the code uses it for velocities. */
  nextSigned(): number {
    const v = this.next();
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  /** x in [8, 632), by rejection from next() & 0x3FF (`02AB:28D0`). */
  x(): number {
    for (;;) {
      const v = this.next() & 0x3ff;
      if (v >= 8 && v < 0x278) return v;
    }
  }

  /** y in [8, 192), by rejection from next() & 0x1FF (`02AB:28E1`). */
  y(): number {
    for (;;) {
      const v = this.next() & 0x1ff;
      if (v >= 8 && v < 0xc0) return v;
    }
  }

  state(): number[] {
    return Array.from(this.s);
  }

  restore(bytes: number[]): void {
    this.s.set(bytes);
  }
}
