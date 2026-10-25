import { expect, test } from 'vitest';
import { Results, RESULT_MS, resultTitle } from './result';
import { MATCH_MS } from './net/matches';
import type { ScoreRow } from './scene';

const row = (side: number, name: string, kills: number): ScoreRow => ({ side, name, kills, deaths: 0 });

test('most kills wins; a tie at the top or no kills is a draw', () => {
  expect(resultTitle([row(0, 'RYAN', 3), row(1, 'BOT', 1)], 0)).toBe('YOU WIN');
  expect(resultTitle([row(0, 'RYAN', 1), row(1, 'BOT', 3)], 0)).toBe('BOT WINS');
  expect(resultTitle([row(0, 'RYAN', 2), row(1, 'BOT', 2)], 0)).toBe('DRAW');
  expect(resultTitle([row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0)).toBe('DRAW');
});

test('the board shows the ended match\'s last scores for a few seconds', () => {
  const r = new Results();
  const start = 100 * MATCH_MS;
  expect(r.frame(start + 1000, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0)).toBeNull();
  expect(r.frame(start + MATCH_MS - 100, [row(0, 'RYAN', 4), row(1, 'BOT', 1)], 0)).toBeNull();
  const shown = r.frame(start + MATCH_MS + 10, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0);
  expect(shown?.title).toBe('YOU WIN');
  expect(shown?.rows[0].kills).toBe(4);
  expect(r.frame(start + MATCH_MS + RESULT_MS + 20, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0)).toBeNull();
});

test('a host whose clock runs ahead zeroes the scores first; the board keeps the last ones', () => {
  const r = new Results();
  const start = 100 * MATCH_MS;
  r.frame(start + 1000, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0);
  r.frame(start + MATCH_MS - 3000, [row(0, 'RYAN', 1), row(1, 'BOT', 2)], 0);
  r.frame(start + MATCH_MS - 1000, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0);
  expect(r.frame(start + MATCH_MS + 10, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0)?.title).toBe('BOT WINS');
});

test('a host whose clock runs behind zeroes the scores after; the new match starts from them', () => {
  const r = new Results();
  const start = 100 * MATCH_MS;
  r.frame(start + 1000, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0);
  r.frame(start + MATCH_MS - 100, [row(0, 'RYAN', 3), row(1, 'BOT', 0)], 0);
  r.frame(start + MATCH_MS + 10, [row(0, 'RYAN', 3), row(1, 'BOT', 0)], 0);
  r.frame(start + MATCH_MS + 1000, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0);
  r.frame(start + 2 * MATCH_MS - 100, [row(0, 'RYAN', 0), row(1, 'BOT', 1)], 0);
  expect(r.frame(start + 2 * MATCH_MS + 10, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0)?.title).toBe('BOT WINS');
});

test('alone, or back from elsewhere, no board', () => {
  const r = new Results();
  const start = 100 * MATCH_MS;
  r.frame(start + 1000, [row(0, 'RYAN', 2)], 0);
  expect(r.frame(start + MATCH_MS + 10, [row(0, 'RYAN', 0)], 0)).toBeNull();
  r.frame(start + MATCH_MS + 1000, [row(0, 'RYAN', 1), row(1, 'BOT', 0)], 0);
  r.reset();
  expect(r.frame(start + 2 * MATCH_MS + 10, [row(0, 'RYAN', 0), row(1, 'BOT', 0)], 0)).toBeNull();
});
