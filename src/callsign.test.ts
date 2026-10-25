import { expect, test } from 'vitest';
import { randomCallsign, cleanCallsign } from './callsign';

test('a random call sign looks like RED-7', () => {
  for (let n = 0; n < 50; n++) expect(randomCallsign()).toMatch(/^[A-Z]+-\d{1,2}$/);
});

test('a changed call sign keeps capitals, digits and a dash, at most 8', () => {
  expect(cleanCallsign('ace pilot!')).toBe('ACEPILOT');
  expect(cleanCallsign('x-wing-123456')).toBe('X-WING-1');
});

test('no person can fly as a robot', () => {
  expect(cleanCallsign('bot')).toBe('');
  expect(cleanCallsign('BOT-9')).toBe('9');
  expect(cleanCallsign('botbot-ace')).toBe('ACE');
  expect(cleanCallsign('ROBOT')).toBe('ROBOT');
});
