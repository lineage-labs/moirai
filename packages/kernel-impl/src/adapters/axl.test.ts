import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AxlAdapter, type AxlConfig } from "./axl.js";
import type { AxlInbound } from "@moirai/kernel";

const AXL_URL = process.env.AXL_URL;
const SETTLE_MS = 2000;     // time for subscription advertisements to propagate
const ROUNDTRIP_MS = 1500;  // time for a published message to be polled by peers
const TEST_TIMEOUT = 30_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe.skipIf(!AXL_URL)("AxlAdapter (integration; requires AXL_URL)", () => {
  let prefix: string;
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => {
    prefix = `moirai-test-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterEach(async () => {
    while (cleanups.length) {
      const fn = cleanups.pop()!;
      await fn().catch(() => {});
    }
  });

  function buildConfig(selfId: string): AxlConfig {
    return {
      selfId,
      axlUrl: AXL_URL as string,
      topicPrefix: prefix,
      pollIntervalMs: 200,
      advertiseIntervalMs: 500,
    };
  }

  function makeAdapter(selfId: string): AxlAdapter {
    const adapter = new AxlAdapter(buildConfig(selfId));
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

      const aliceTopo = await alice.topology();
      expect(aliceTopo.sort()).toEqual(["bob", "carol"]);
      expect(aliceTopo).not.toContain("alice");

      const bobTopo = await bob.topology();
      expect(bobTopo.sort()).toEqual(["alice", "carol"]);
    },
    TEST_TIMEOUT,
  );

  it("whisper / broadcast before connect resolves silently (partition contract)", async () => {
    const alice = new AxlAdapter(buildConfig("alice"));
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
      const alice = new AxlAdapter(buildConfig("alice"));
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
