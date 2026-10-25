import type { Sheet } from './design/bitmaps';
import { font } from './design/bitmaps';
import { SCREEN_W, SCREEN_H } from './design/tokens';

/**
 * The CGA screen as the DOS game used it: 640x200 one-bit pixels that are
 * drawn and erased by XOR, so every overlap and leftover the original shows,
 * this shows too (original.md, Sprites).
 */
export class Screen {
  readonly px = new Uint8Array(SCREEN_W * SCREEN_H);

  clear(): void {
    this.px.fill(0);
  }

  xorPixel(x: number, y: number): void {
    x = ((x % SCREEN_W) + SCREEN_W) % SCREEN_W;
    y = ((y % SCREEN_H) + SCREEN_H) % SCREEN_H;
    this.px[y * SCREEN_W + x] ^= 1;
  }

  setPixel(x: number, y: number, on: boolean): void {
    this.px[y * SCREEN_W + x] = on ? 1 : 0;
  }

  /** XOR a frame centred on (x, y), offset by half its height both ways, as `02AB:1B1A` does. */
  blit(sheet: Sheet, frame: number, x: number, y: number): void {
    const rows = sheet.frames[frame];
    const half = sheet.height >> 1;
    const left = x - half;
    const top = y - half;
    for (let r = 0; r < rows.length; r++) {
      const bits = rows[r];
      if (!bits) continue;
      for (let c = 0; c < sheet.width; c++) {
        if (bits & (1 << (sheet.width - 1 - c))) this.xorPixel(left + c, top + r);
      }
    }
  }

  /** Draw a frame opaquely, its left edge on the byte boundary at or left of x - 16 (`02AB:1CE2`). */
  blitOpaque(sheet: Sheet, frame: number, x: number, y: number): void {
    const rows = sheet.frames[frame];
    const left = ((x - (sheet.width >> 1)) >> 3) << 3;
    const top = y - (sheet.height >> 1);
    for (let r = 0; r < rows.length; r++) {
      const yy = (top + r + SCREEN_H) % SCREEN_H;
      for (let c = 0; c < sheet.width; c++) {
        this.setPixel((left + c + SCREEN_W) % SCREEN_W, yy, (rows[r] & (1 << (sheet.width - 1 - c))) !== 0);
      }
    }
  }

  /**
   * A bar `value` pixels long on row y, one row tall, then 16 pixels cleared past
   * its end, written over whatever is there (`02AB:1D2F`). A negative value leaves
   * the old bar as it was, as the original does.
   */
  bar(value: number, y: number, fromLeft: boolean): void {
    if (value < 0) return;
    const words = value >> 4;
    const end = (words + 1) * 16 + 16;
    for (let i = 0; i < end; i++) {
      const on = i < value;
      const x = fromLeft ? 24 + i : 615 - i;
      if (x >= 0 && x < SCREEN_W) this.setPixel(x, y, on);
    }
  }

  /**
   * Text in the game's font, as `02AB:1C2D` draws it: each glyph XORed centred on
   * the pen, 10 pixels a character; 0x1F moves half a character, CR returns to
   * x 10, LF goes down 8.
   */
  text(s: string, x: number, y: number): { x: number; y: number } {
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c === 0x0d) {
        x = 10;
        continue;
      }
      if (c === 0x0a) {
        y += 8;
        continue;
      }
      if (c === 0x1f) {
        x += 5;
      } else {
        if (c !== 0x20) this.blit(font, c & 0x7f, x, y);
        x += 10;
      }
      if (x >= SCREEN_W) {
        x -= SCREEN_W;
        y = (y + 8) % SCREEN_H;
      }
    }
    return { x, y };
  }
}
