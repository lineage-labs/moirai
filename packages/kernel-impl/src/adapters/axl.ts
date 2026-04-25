import type { INetworkAdapter, AxlInbound } from "@moirai/kernel";

export type AxlConfig = {
  selfId: string;
  nodeUrl: string;
};

export class AxlAdapter implements INetworkAdapter {
  private handlers: Array<(msg: AxlInbound) => void | Promise<void>> = [];
  private connected = false;

  constructor(private readonly cfg: AxlConfig) {}

  myPeerId(): string {
    return this.cfg.selfId;
  }

  async topology(): Promise<string[]> {
    if (!this.connected) return [];
    throw new Error(
      `AxlAdapter.topology not wired. Wire AXL node HTTP API call. selfId=${this.cfg.selfId} nodeUrl=${this.cfg.nodeUrl}`,
    );
  }

  async whisper(_peerId: string, _payload: unknown): Promise<void> {
    if (!this.connected) return;
    throw new Error(
      `AxlAdapter.whisper not wired. selfId=${this.cfg.selfId} nodeUrl=${this.cfg.nodeUrl}`,
    );
  }

  async broadcast(_payload: unknown): Promise<void> {
    if (!this.connected) return;
    throw new Error(
      `AxlAdapter.broadcast not wired. selfId=${this.cfg.selfId} nodeUrl=${this.cfg.nodeUrl}`,
    );
  }

  subscribe(handler: (msg: AxlInbound) => void | Promise<void>): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  async connect(_peerAddrs: string[]): Promise<void> {
    throw new Error(
      `AxlAdapter.connect not wired. Wire AXL node HTTP API. selfId=${this.cfg.selfId} nodeUrl=${this.cfg.nodeUrl}`,
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
