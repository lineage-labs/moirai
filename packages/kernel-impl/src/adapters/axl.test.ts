import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { AxlAdapter, type AxlConfig } from "./axl.js";
import type { AxlInbound } from "@moirai/kernel";

const AXL_URL = process.env.AXL_URL;
const AXL_URL_1 = process.env.AXL_URL_1 ?? AXL_URL;
const AXL_URL_2 = process.env.AXL_URL_2 ?? AXL_URL;
const AXL_URL_3 = process.env.AXL_URL_3 ?? AXL_URL;

// axl-pubsub requires the adapter's keypair to MATCH the AXL daemon's PEM key,
// because the daemon stamps /recv with its own pubkey in X-From-Peer-Id and the
// adapter's signed envelope.from must match it. In dev/multi-node mode we load
// the docker mesh keys directly from docker/axl/keys/.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const KEY_PATH_ALICE = process.env.AXL_KEY_PATH_1 ?? resolve(REPO_ROOT, "docker/axl/keys/alice.pem");
const KEY_PATH_BOB = process.env.AXL_KEY_PATH_2 ?? resolve(REPO_ROOT, "docker/axl/keys/bob.pem");
const KEY_PATH_CHARLIE = process.env.AXL_KEY_PATH_3 ?? resolve(REPO_ROOT, "docker/axl/keys/charlie.pem");
/** Hub-and-spoke mesh needs Yggdrasil + sub_ad fan-out; single-URL dev is faster. */
const MULTI_NODE = Boolean(AXL_URL_1 && AXL_URL_2 && AXL_URL_1 !== AXL_URL_2);
const SETTLE_MS = MULTI_NODE ? 1500 : 2000; // base sleep after connect; mesh readiness uses waitForTopology
const ROUNDTRIP_MS = MULTI_NODE ? 4000 : 1500;
const TOPOLOGY_WAIT_MS = MULTI_NODE ? 45_000 : 12_000;
const TEST_TIMEOUT = 90_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait until `observer` has received sub_ads so `topology()` includes every logical `peerId`. */
async function waitForTopology(observer: AxlAdapter, peerIds: string[], timeoutMs: number): Promise<void> {
  const want = new Set(peerIds);
  const deadline = Date.now() + timeoutMs;
  let last: string[] = [];
  while (Date.now() < deadline) {
    last = await observer.topology();
    if (peerIds.every((id) => last.includes(id))) return;
    await sleep(400);
  }
  throw new Error(
    `${observer.myPeerId()}: topology never included ${[...want].join(", ")} within ${timeoutMs}ms (last=${JSON.stringify(last)})`,
  );
}

type AxlTopology = {
  our_public_key?: string;
  peers?: Array<{ uri?: string; public_key?: string; key?: string; pubkey?: string }>;
};

async function fetchTopology(url: string): Promise<AxlTopology> {
  const res = await fetch(`${url}/topology`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error(`${url}/topology -> HTTP ${res.status}`);
  return (await res.json()) as AxlTopology;
}

/**
 * Verify the configured AXL daemons form the expected hub-and-spoke mesh BEFORE running tests.
 * Catches the macOS port-collision case (a standalone AXL on 127.0.0.1:9002 shadowing docker's
 * publish) which otherwise silently routes test traffic to the wrong daemon.
 */
async function preflightMesh(url1: string, url2: string, url3: string): Promise<void> {
  const [t1, t2, t3] = await Promise.all([url1, url2, url3].map(fetchTopology)).catch((e) => {
    throw new Error(
      `[axl preflight] could not reach one of ${url1}, ${url2}, ${url3}: ${(e as Error).message}. ` +
        `Run: pnpm axl:mesh:up`,
    );
  });
  if (!t1 || !t2 || !t3) throw new Error("[axl preflight] missing topology response from at least one node");
  const pk1 = t1.our_public_key, pk2 = t2.our_public_key, pk3 = t3.our_public_key;
  if (!pk1 || !pk2 || !pk3) {
    throw new Error(`[axl preflight] /topology returned no our_public_key on at least one node`);
  }
  const peerKeys = (t: AxlTopology) =>
    (t.peers ?? []).map((p) => p.public_key ?? p.key ?? p.pubkey).filter(Boolean) as string[];
  const peers1 = new Set(peerKeys(t1));
  const peers2 = new Set(peerKeys(t2));
  const peers3 = new Set(peerKeys(t3));

  // Catch the port-collision: bob/charlie think alice is X, but $url1 reports Y.
  const bobAlice = (t2.peers ?? []).find((p) => p.uri?.includes("alice"))?.public_key;
  if (bobAlice && bobAlice !== pk1) {
    throw new Error(
      `[axl preflight] ${url1} reports our_public_key=${pk1}, but bob's mesh sees alice=${bobAlice}. ` +
        `That means ${url1} is NOT the docker mesh's alice — most likely a standalone AXL daemon ` +
        `is shadowing the docker publish (classic on macOS when both bind 9002). Fix: ` +
        `1) set AXL_URL_1/_2/_3 to 19002/19012/19022 (matches docker-compose.axl.yml), or ` +
        `2) lsof -nP -iTCP:9002 -sTCP:LISTEN and stop the squatter.`,
    );
  }
  if (!peers1.has(pk2) || !peers1.has(pk3) || !peers2.has(pk1) || !peers3.has(pk1)) {
    throw new Error(
      `[axl preflight] mesh not fully peered. alice peers=${[...peers1].length}, ` +
        `bob peers=${[...peers2].length}, charlie peers=${[...peers3].length}. ` +
        `Inspect: docker logs moirai-axl-bob`,
    );
  }
}

describe.skipIf(!AXL_URL_1)("AxlAdapter (integration; requires AXL_URL_1 or AXL_URL)", () => {
  let prefix: string;
  const cleanups: Array<() => Promise<void>> = [];

  // Only enforced for true 3-node setups. Single-URL "dev" mode skips this preflight.
  if (MULTI_NODE && AXL_URL_1 && AXL_URL_2 && AXL_URL_3) {
    beforeAll(async () => {
      await preflightMesh(AXL_URL_1, AXL_URL_2, AXL_URL_3);
    }, 30_000);
  }

  beforeEach(() => {
    prefix = `moirai-test-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterEach(async () => {
    while (cleanups.length) {
      const fn = cleanups.pop()!;
      await fn().catch(() => {});
    }
  });

  function buildConfig(selfId: string, axlUrl: string): AxlConfig {
    const cfg: AxlConfig = {
      selfId,
      axlUrl,
      topicPrefix: prefix,
      pollIntervalMs: 200,
      advertiseIntervalMs: 500,
    };
    const keyPath = keyPathFor(selfId);
    if (keyPath) cfg.privateKeyPath = keyPath;
    return cfg;
  }

  function axlUrlFor(selfId: string): string {
    if (selfId === "alice") return AXL_URL_1 as string;
    if (selfId === "bob") return AXL_URL_2 as string;
    if (selfId === "carol") return AXL_URL_3 as string;
    return AXL_URL_1 as string;
  }

  /**
   * Path to the daemon PEM that backs this logical peer. The adapter MUST use the
   * same keypair as the daemon it talks to (axl-pubsub fromHeaderMatchesPubkey check).
   * Returns null if the file is missing — in single-node dev the user can run with
   * AXL_URL only and we fall back to ephemeral keys (delivery will fail the check,
   * but topology() and connect() still work for smoke).
   */
  function keyPathFor(selfId: string): string | null {
    let p: string | null = null;
    if (selfId === "alice") p = KEY_PATH_ALICE;
    else if (selfId === "bob") p = KEY_PATH_BOB;
    else if (selfId === "carol") p = KEY_PATH_CHARLIE;
    if (!p) return null;
    return existsSync(p) ? p : null;
  }

  function makeAdapter(selfId: string): AxlAdapter {
    const adapter = new AxlAdapter(buildConfig(selfId, axlUrlFor(selfId)));
    cleanups.push(() => adapter.disconnect());
    return adapter;
  }

  it("returns the configured logical peer id", () => {
    const alice = makeAdapter("alice");
    expect(alice.myPeerId()).toBe("alice");
  });

  it(
    "delivers whisper from one peer to another",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");

      const inbox: AxlInbound[] = [];
      bob.subscribe((m) => {
        inbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      await alice.whisper("bob", { kind: "TEACH", skillId: "skill_x" });
      await sleep(ROUNDTRIP_MS);

      expect(inbox.length).toBe(1);
      expect(inbox[0]?.from).toBe("alice");
      expect(inbox[0]?.payload).toEqual({ kind: "TEACH", skillId: "skill_x" });
    },
    TEST_TIMEOUT,
  );

  it(
    "does not deliver whisper to non-target peers",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");
      const carol = makeAdapter("carol");

      const bobInbox: AxlInbound[] = [];
      const carolInbox: AxlInbound[] = [];
      bob.subscribe((m) => {
        bobInbox.push(m);
      });
      carol.subscribe((m) => {
        carolInbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await carol.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      await alice.whisper("bob", { secret: 42 });
      await sleep(ROUNDTRIP_MS);

      expect(bobInbox.length).toBe(1);
      expect(carolInbox).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "delivers broadcast to all subscribed peers",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");
      const carol = makeAdapter("carol");

      const bobInbox: AxlInbound[] = [];
      const carolInbox: AxlInbound[] = [];
      bob.subscribe((m) => {
        bobInbox.push(m);
      });
      carol.subscribe((m) => {
        carolInbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await carol.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob", "carol"], TOPOLOGY_WAIT_MS);

      await alice.broadcast({ kind: "ANNOUNCE", body: "hello" });
      await sleep(ROUNDTRIP_MS);

      expect(bobInbox.length).toBe(1);
      expect(bobInbox[0]?.from).toBe("alice");
      expect(bobInbox[0]?.payload).toEqual({ kind: "ANNOUNCE", body: "hello" });
      expect(carolInbox.length).toBe(1);
      expect(carolInbox[0]?.from).toBe("alice");
    },
    TEST_TIMEOUT,
  );

  it(
    "does not loopback own broadcast to sender",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");

      const aliceInbox: AxlInbound[] = [];
      alice.subscribe((m) => {
        aliceInbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      await alice.broadcast({ kind: "ECHO_TEST" });
      await sleep(ROUNDTRIP_MS);

      expect(aliceInbox).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "topology() reports connected peers, excluding self",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");
      const carol = makeAdapter("carol");

      await alice.connect([]);
      await bob.connect([]);
      await carol.connect([]);
      await sleep(SETTLE_MS);
      // Deterministic contract in this mesh:
      // - alice must see both leaves
      // - each leaf must see alice
      // Leaf<->leaf visibility can appear via relayed sub_ad propagation, but it is timing-
      // dependent and not stable enough to hard-assert in CI.
      await waitForTopology(alice, ["bob", "carol"], TOPOLOGY_WAIT_MS);
      await waitForTopology(bob, ["alice"], TOPOLOGY_WAIT_MS);
      await waitForTopology(carol, ["alice"], TOPOLOGY_WAIT_MS);

      const aliceTopo = await alice.topology();
      expect(aliceTopo.sort()).toEqual(["bob", "carol"]);
      expect(aliceTopo).not.toContain("alice");

      const bobTopo = await bob.topology();
      expect(bobTopo).toContain("alice");
      expect(bobTopo).not.toContain("bob");

      const carolTopo = await carol.topology();
      expect(carolTopo).toContain("alice");
      expect(carolTopo).not.toContain("carol");
    },
    TEST_TIMEOUT,
  );

  it("whisper / broadcast before connect resolves silently (partition contract)", async () => {
    const alice = new AxlAdapter(buildConfig("alice", axlUrlFor("alice")));
    cleanups.push(() => alice.disconnect());

    await expect(alice.whisper("bob", { x: 1 })).resolves.toBeUndefined();
    await expect(alice.broadcast({ x: 1 })).resolves.toBeUndefined();
    expect(await alice.topology()).toEqual([]);
  });

  it(
    "subscribe returns an unsubscribe function that stops delivery",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");

      const inbox: AxlInbound[] = [];
      const unsubscribe = bob.subscribe((m) => {
        inbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      await alice.whisper("bob", { n: 1 });
      await sleep(ROUNDTRIP_MS);
      expect(inbox.length).toBe(1);

      unsubscribe();
      await alice.whisper("bob", { n: 2 });
      await sleep(ROUNDTRIP_MS);
      expect(inbox.length).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "supports multiple concurrent subscribers on the same adapter",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");

      const inboxA: AxlInbound[] = [];
      const inboxB: AxlInbound[] = [];
      bob.subscribe((m) => {
        inboxA.push(m);
      });
      bob.subscribe((m) => {
        inboxB.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      await alice.whisper("bob", { n: 42 });
      await sleep(ROUNDTRIP_MS);

      expect(inboxA.length).toBe(1);
      expect(inboxB.length).toBe(1);
      expect(inboxA[0]?.payload).toEqual({ n: 42 });
      expect(inboxB[0]?.payload).toEqual({ n: 42 });
    },
    TEST_TIMEOUT,
  );

  it(
    "delivers a stream of rapid whispers without dropping",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");

      const inbox: AxlInbound[] = [];
      bob.subscribe((m) => {
        inbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      const N = 5;
      for (let i = 0; i < N; i++) {
        await alice.whisper("bob", { seq: i });
      }
      await sleep(ROUNDTRIP_MS * 2);

      expect(inbox.length).toBe(N);
      const seqs = inbox
        .map((m) => (m.payload as { seq: number }).seq)
        .sort((a, b) => a - b);
      expect(seqs).toEqual([0, 1, 2, 3, 4]);
    },
    TEST_TIMEOUT,
  );

  it(
    "supports a connect / disconnect / connect cycle on the same adapter",
    async () => {
      const alice = new AxlAdapter(buildConfig("alice", axlUrlFor("alice")));
      cleanups.push(() => alice.disconnect());

      await alice.connect([]);
      await alice.disconnect();
      await alice.connect([]);
      expect(alice.myPeerId()).toBe("alice");
    },
    TEST_TIMEOUT,
  );

  it(
    "delivers structured payloads without mutation",
    async () => {
      const alice = makeAdapter("alice");
      const bob = makeAdapter("bob");

      const inbox: AxlInbound[] = [];
      bob.subscribe((m) => {
        inbox.push(m);
      });

      await alice.connect([]);
      await bob.connect([]);
      await sleep(SETTLE_MS);
      await waitForTopology(alice, ["bob"], TOPOLOGY_WAIT_MS);

      const payload = {
        kind: "TEACH",
        skill: {
          id: "skill_throw_rocks",
          name: "throw_sharp_rocks",
          steps: ["pick up rocks", "throw at lion"],
          provenance: { selfEvalScore: 0.72 },
        },
      };
      await alice.whisper("bob", payload);
      await sleep(ROUNDTRIP_MS);

      expect(inbox.length).toBe(1);
      expect(inbox[0]?.payload).toEqual(payload);
    },
    TEST_TIMEOUT,
  );
});
