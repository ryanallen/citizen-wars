// The CITIZEN WARS block title (design-system.md, Type: Citizen Wars title).
// Blocks are font characters: # 14 full, 1 15 ◢, 2 16 ◣, 3 17 ◤, 4 18 ◥.

const LETTERS: Record<string, string[]> = {
  C: ['1#3', '#..', '#..', '#..', '4#3'],
  E: ['1#3', '#..', '#3.', '#..', '4#3'],
  A: ['1#3', '#.#', '###', '#.#', '3.3'],
  R: ['1#2', '#.#', '#23', '#42', '3.4'],
  S: ['1#3', '#..', '4#2', '..#', '1#3'],
  W: ['1..1', '#..#', '#..#', '#12#', '4343'],
  I: ['1', '#', '#', '#', '3'],
  T: ['1#3', '.#.', '.#.', '.#.', '.3.'],
  Z: ['1#3', '..#', '1#3', '#..', '4#3'],
  N: ['1#2', '#.#', '#.#', '#.#', '3.3'],
};
const CODE: Record<string, number> = { '#': 14, '1': 15, '2': 16, '3': 17, '4': 18 };

export interface Block { x: number; y: number; code: number }

/** Each block's pen position, centred lines of 16x8 blocks, 48 px apart from y 48. */
export function titleBlocks(lines = ['CITIZEN', 'WARS'], top = 48, gap = 48): Block[] {
  const out: Block[] = [];
  lines.forEach((word, n) => {
    const cols = [...word].reduce((c, ch) => c + LETTERS[ch][0].length + 1, -1);
    let x0 = 320 - (cols * 16) / 2 + 8;
    const y0 = top + n * gap;
    for (const ch of word) {
      const rows = LETTERS[ch];
      rows.forEach((row, r) => {
        [...row].forEach((p, k) => {
          if (p !== '.') out.push({ x: x0 + k * 16, y: y0 + r * 8, code: CODE[p] });
        });
      });
      x0 += (rows[0].length + 1) * 16;
    }
  });
  return out;
}
