// The match-over board (design-system.md, Match over): when the match clock
// runs out, the last scores of the match it ended, with who won, for a few
// seconds. Most kills wins; a tie at the top, or no kills, is a draw.
//
// Host and clients alike read it from the scores they draw. A host zeroes the
// scores on its own clock, which may run a moment ahead of or behind this
// one's, so the board keeps the match's highest scores and ignores the fall.

import { matchAt, msLeft } from './net/matches';
import type { ScoreRow } from './scene';

export const RESULT_MS = 6000;
/** A fall in the scores this close to the end is the host's clock running ahead. */
const SKEW_MS = 5000;

export interface Result { title: string; rows: ScoreRow[] }

export function resultTitle(rows: ScoreRow[], me: number | null): string {
  const top = Math.max(0, ...rows.map((r) => r.kills));
  const leaders = rows.filter((r) => r.kills === top);
  if (!top || leaders.length !== 1) return 'DRAW';
  return leaders[0].side === me ? 'YOU WIN' : `${leaders[0].name} WINS`;
}

const total = (rows: ScoreRow[]) => rows.reduce((t, r) => t + r.kills, 0);

export class Results {
  private match = -1;
  private best: ScoreRow[] = [];
  private frozen = false;
  private shown: { result: Result; until: number } | null = null;

  /** Out of a system: nothing carries over to the next match it sees. */
  reset(): void {
    this.match = -1;
    this.best = [];
    this.frozen = false;
  }

  /** One frame's scores; the board to show now, if any. */
  frame(now: number, rows: ScoreRow[], me: number | null): Result | null {
    const m = matchAt(now);
    if (m !== this.match) {
      if (m === this.match + 1 && this.best.length > 1) {
        this.shown = { result: { title: resultTitle(this.best, me), rows: this.best }, until: now + RESULT_MS };
      }
      this.match = m;
      this.best = rows;
      this.frozen = false;
    }
    if (total(rows) >= total(this.best)) {
      if (!this.frozen) this.best = rows;
    } else if (msLeft(now) < SKEW_MS) {
      this.frozen = true;
    } else {
      // The host's clock ran behind: its new match began after this one's.
      this.best = rows;
    }
    return this.shown && now < this.shown.until ? this.shown.result : null;
  }
}
