// One WebRTC connection with two data channels (ticket, Phase 3): a reliable
// one for joining, leaving and hand-over, and one that drops late packets for
// inputs and worlds. Candidates are gathered before the offer or answer is
// sent, so a handshake is one message each way.

import { STUN } from './config';

export type Channel = 'reliable' | 'fast';

export class Peer {
  readonly pc: RTCPeerConnection;
  readonly reliable: RTCDataChannel;
  readonly fast: RTCDataChannel;
  onMessage: (channel: Channel, data: ArrayBuffer | string) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  private opened = 0;
  private closed = false;

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: STUN }] });
    // Negotiated channels with fixed ids, so both ends make the same two.
    this.reliable = this.pc.createDataChannel('reliable', { negotiated: true, id: 0, ordered: true });
    this.fast = this.pc.createDataChannel('fast', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    for (const [ch, name] of [[this.reliable, 'reliable'], [this.fast, 'fast']] as const) {
      ch.binaryType = 'arraybuffer';
      ch.onopen = () => { if (++this.opened === 2) this.onOpen(); };
      ch.onclose = () => this.close();
      ch.onmessage = (m) => this.onMessage(name, m.data);
    }
    this.pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(this.pc.connectionState)) this.close();
    };
  }

  get isOpen(): boolean {
    return this.opened === 2 && !this.closed;
  }

  private async gathered(timeoutMs = 3000): Promise<string> {
    if (this.pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        this.pc.addEventListener('icegatheringstatechange', () => {
          if (this.pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); }
        });
      });
    }
    return this.pc.localDescription!.sdp;
  }

  async offer(): Promise<string> {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return this.gathered();
  }

  async answer(offerSdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return this.gathered();
  }

  async accept(answerSdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  /** Wait for both channels, or give up. */
  opens(timeoutMs = 10000): Promise<boolean> {
    if (this.isOpen) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      const prev = this.onOpen;
      this.onOpen = () => { clearTimeout(timer); prev(); resolve(true); };
      const prevClose = this.onClose;
      this.onClose = () => { clearTimeout(timer); prevClose(); resolve(false); };
    });
  }

  send(channel: Channel, data: ArrayBuffer | Uint8Array | string): void {
    const ch = channel === 'reliable' ? this.reliable : this.fast;
    if (ch.readyState !== 'open') return;
    try {
      if (typeof data === 'string') ch.send(data);
      else ch.send(data as ArrayBuffer);
    } catch {
      // A full or closing channel drops it, as the fast channel is meant to.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.pc.close(); } catch { /* already closed */ }
    this.onClose();
  }
}
