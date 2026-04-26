import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  Gossip,
  parseKeyPairFromPem,
  type KeyPair,
  type ReceivedPub,
  type Subscription,
} from "axl-pubsub";
import type { INetworkAdapter, AxlInbound } from "@moirai/kernel";

export type AxlConfig = {
  selfId: string;
  axlUrl: string;
  privateKeyPath?: string;
  privateKeyPem?: string;
  topicPrefix?: string;
  pollIntervalMs?: number;
  advertiseIntervalMs?: number;
  subscriptionTtlMs?: number;
};

export class AxlAdapter implements INetworkAdapter {
  private gossip: Gossip | null = null;
  private subscriptions: Subscription[] = [];
  private handlers: Array<(msg: AxlInbound) => void | Promise<void>> = [];
  private connected = false;
  private readonly topicPrefix: string;

  constructor(private readonly cfg: AxlConfig) {
    this.topicPrefix = cfg.topicPrefix ?? "moirai";
  }

  myPeerId(): string {
    return this.cfg.selfId;
  }

  async connect(_peerAddrs: string[]): Promise<void> {
    if (this.connected) return;

    const keyPair = await this.resolveKeyPair();

    const gossipOpts: ConstructorParameters<typeof Gossip>[0] = {
      axlUrl: this.cfg.axlUrl,
      keyPair,
    };
    if (this.cfg.pollIntervalMs !== undefined) gossipOpts.pollIntervalMs = this.cfg.pollIntervalMs;
    if (this.cfg.advertiseIntervalMs !== undefined)
      gossipOpts.advertiseIntervalMs = this.cfg.advertiseIntervalMs;
    if (this.cfg.subscriptionTtlMs !== undefined)
      gossipOpts.subscriptionTtlMs = this.cfg.subscriptionTtlMs;

    this.gossip = new Gossip(gossipOpts);
    await this.gossip.start();

    const directTopic = `${this.topicPrefix}.peer.${this.cfg.selfId}`;
    const broadcastTopic = `${this.topicPrefix}.broadcast`;

    const directSub = await this.gossip.subscribe(directTopic, (msg) => {
      this.dispatchInbound(msg);
    });
    const broadcastSub = await this.gossip.subscribe(broadcastTopic, (msg) => {
      this.dispatchInbound(msg);
    });

    this.subscriptions.push(directSub, broadcastSub);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.gossip) {
      this.connected = false;
      return;
    }
    for (const sub of this.subscriptions) {
      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }
    }
    this.subscriptions = [];
    try {
      await this.gossip.stop();
    } catch {
      // ignore
    }
    this.gossip = null;
    this.connected = false;
  }

  async whisper(peerId: string, payload: unknown): Promise<void> {
    if (!this.connected || !this.gossip) return;
    const bytes = this.encodePayload(payload);
    try {
      await this.gossip.publish(`${this.topicPrefix}.peer.${peerId}`, bytes);
    } catch {
      // partition contract: send may resolve without delivery; do not throw.
    }
  }

  async broadcast(payload: unknown): Promise<void> {
    if (!this.connected || !this.gossip) return;
    const bytes = this.encodePayload(payload);
    try {
      await this.gossip.publish(`${this.topicPrefix}.broadcast`, bytes);
    } catch {
      // partition contract: do not throw.
    }
  }

  subscribe(handler: (msg: AxlInbound) => void | Promise<void>): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Live peer logical-IDs derived from AXL's own subscription gossip.
   * Each peer subscribes to `${prefix}.peer.<selfId>`; we extract the suffix.
   */
  async topology(): Promise<string[]> {
    if (!this.gossip) return [];
    const peers = this.gossip.knownPeers();
    const prefix = `${this.topicPrefix}.peer.`;
    const ids = new Set<string>();
    for (const p of peers) {
      for (const t of p.topics) {
        if (t.startsWith(prefix)) {
          const id = t.slice(prefix.length);
          if (id && id !== this.cfg.selfId) ids.add(id);
        }
      }
    }
    return [...ids];
  }

  private encodePayload(payload: unknown): Uint8Array {
    const wrapped = { from: this.cfg.selfId, body: payload };
    return new TextEncoder().encode(JSON.stringify(wrapped));
  }

  private dispatchInbound(msg: ReceivedPub): void {
    let from = msg.from;
    let body: unknown = null;
    try {
      const text = new TextDecoder().decode(msg.payload);
      const parsed = JSON.parse(text) as { from?: string; body?: unknown };
      if (parsed.from) from = parsed.from;
      body = parsed.body;
    } catch {
      body = msg.payload;
    }
    if (from === this.cfg.selfId) return; // ignore loopback
    const inbound: AxlInbound = { from, payload: body };
    for (const h of this.handlers) void h(inbound);
  }

  private async resolveKeyPair(): Promise<KeyPair> {
    if (this.cfg.privateKeyPem) {
      return parseKeyPairFromPem(this.cfg.privateKeyPem);
    }
    if (this.cfg.privateKeyPath) {
      const pem = await readFile(this.cfg.privateKeyPath, "utf8");
      return parseKeyPairFromPem(pem);
    }
    return generateEphemeralKeyPair();
  }
}

async function generateEphemeralKeyPair(): Promise<KeyPair> {
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  return parseKeyPairFromPem(pem);
}
