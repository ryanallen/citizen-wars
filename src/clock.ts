/** The DOS game's timer: 1,193,182 / 16,390 = 72.80 ticks a second (ticket, Decisions). */
export const TICK_HZ = 1193182 / 16390;
export const TICK_MS = 1000 / TICK_HZ;
/** Most ticks run to catch up after a stall, so a hidden tab does not fast-forward. */
export const MAX_CATCH_UP = 18;

/** Turns elapsed real time into whole ticks, carrying the remainder. */
export class Clock {
  private last: number | null = null;
  private carry = 0;

  ticks(now: number): number {
    if (this.last === null) {
      this.last = now;
      return 0;
    }
    this.carry += now - this.last;
    this.last = now;
    const n = Math.floor(this.carry / TICK_MS);
    this.carry -= n * TICK_MS;
    if (n > MAX_CATCH_UP) {
      this.carry = 0;
      return MAX_CATCH_UP;
    }
    return n;
  }
}
