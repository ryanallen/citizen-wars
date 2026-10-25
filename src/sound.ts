// The PC speaker through Web Audio (design-system.md, Sound): one square wave
// at PIT_HZ / divisor, and white noise for a ship's explosion clicks.

import { PIT_HZ } from './design/tokens';

export class Speaker {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private noiseGain: GainNode | null = null;

  /** Browsers start audio only after a key or click; call this from one. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let n = 0; n < data.length; n++) data[n] = Math.random() < 0.5 ? -1 : 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseGain).connect(ctx.destination);
    noise.start();
    Object.assign(this, { ctx, osc, gain, noiseGain });
  }

  /** Set what plays now: a tone at a divisor or silence, and the click density 0..1. */
  set(on: boolean, divisor: number, clicks: number): void {
    if (!this.ctx || !this.osc || !this.gain || !this.noiseGain) return;
    const t = this.ctx.currentTime;
    if (on && divisor > 0) {
      this.osc.frequency.setValueAtTime(Math.min(PIT_HZ / divisor, 20000), t);
      this.gain.gain.setValueAtTime(0.08, t);
    } else {
      this.gain.gain.setValueAtTime(0, t);
    }
    this.noiseGain.gain.setValueAtTime(0.15 * clicks, t);
  }
}
