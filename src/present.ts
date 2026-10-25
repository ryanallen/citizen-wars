// Puts the 640x200 screen on the page (design-system.md, Screen): each pixel
// 1 wide and 2 tall, scaled to fill the window at its shape, drawn at the
// display's own pixels with no smoothing, centred, white on black.

import { Screen } from './screen';
import { SCREEN_W, SCREEN_H, PIXEL_ASPECT } from './design/tokens';

export function fillScale(width: number, height: number): number {
  return Math.min(width / SCREEN_W, height / (SCREEN_H * PIXEL_ASPECT));
}

export class Presenter {
  private image: ImageData;
  private buffer = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.buffer.width = SCREEN_W;
    this.buffer.height = SCREEN_H;
    this.bctx = this.buffer.getContext('2d')!;
    this.image = this.bctx.createImageData(SCREEN_W, SCREEN_H);
    this.ctx = canvas.getContext('2d')!;
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  fit(): void {
    const k = fillScale(window.innerWidth, window.innerHeight);
    const w = Math.floor(SCREEN_W * k);
    const h = Math.floor(SCREEN_H * PIXEL_ASPECT * k);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  draw(screen: Screen): void {
    const d = this.image.data;
    const px = screen.px;
    for (let n = 0; n < px.length; n++) {
      const v = px[n] ? 255 : 0;
      const o = n * 4;
      d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
    }
    this.bctx.putImageData(this.image, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }
}
