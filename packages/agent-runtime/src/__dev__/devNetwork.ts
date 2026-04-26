// DEV-ONLY. Stand-in for the kernel team's AXL adapter.
// Routes peer messages through the engine via parent-process IPC.

import type { EngineToAgentMessage } from "@moirai/shared";
import type { INetworkAdapter, PeerMessageHandler } from "@moirai/kernel";
import { sendToEngine } from "../parentIpc.js";

export class DevIpcNetworkAdapter implements INetworkAdapter {
  private handlers = new Set<PeerMessageHandler>();
  private peerId: string;
  private peers: string[];

  constructor(peerId: string, peers: string[]) {
    this.peerId = peerId;
    this.peers = peers;
    process.on("message", (raw: EngineToAgentMessage) => {
      if (raw && raw.kind === "PEER_MESSAGE") {
        const msg = { from: raw.from, payload: raw.payload };
        for (const h of this.handlers) void h(msg);
      }
    });
  }

  myPeerId(): string {
    return this.peerId;
  }

  async whisper(peerId: string, payload: unknown): Promise<void> {
    sendToEngine({ kind: "PEER_SEND", to: peerId, payload });
  }

  async broadcast(payload: unknown): Promise<void> {
    sendToEngine({ kind: "PEER_BROADCAST", payload });
  }

  subscribe(handler: PeerMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async topology(): Promise<string[]> {
    return [...this.peers];
  }
}
