import type { EngineToAgentMessage } from "@moirai/shared";

/**
 * Dev-mode peer routing — forwards PEER_SEND/PEER_BROADCAST from one agent
 * process to others' IPC channels. Stand-in for real AXL while the kernel
 * team's AXL adapter is being built. The agent-runtime's network adapter
 * uses parent-process IPC; this is the engine side that fans messages out.
 *
 * In production, this router goes away — agents speak directly to each other
 * over AXL via the kernel's INetworkAdapter implementation.
 */
export class PeerRouter {
  private sendByPeer = new Map<string, (msg: EngineToAgentMessage) => void>();

  register(agentId: string, send: (msg: EngineToAgentMessage) => void): void {
    this.sendByPeer.set(agentId, send);
  }

  unregister(agentId: string): void {
    this.sendByPeer.delete(agentId);
  }

  whisper(from: string, to: string, payload: unknown): boolean {
    const send = this.sendByPeer.get(to);
    if (!send) return false;
    send({ kind: "PEER_MESSAGE", from, payload });
    return true;
  }

  broadcast(from: string, payload: unknown): number {
    let count = 0;
    for (const [peerId, send] of this.sendByPeer) {
      if (peerId === from) continue;
      send({ kind: "PEER_MESSAGE", from, payload });
      count++;
    }
    return count;
  }

  topology(): { peerId: string }[] {
    return [...this.sendByPeer.keys()].map((peerId) => ({ peerId }));
  }
}
