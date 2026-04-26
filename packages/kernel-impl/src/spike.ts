import { ZeroGComputeAdapter } from "./adapters/0g-compute.js";
import { ZeroGStorageAdapter } from "./adapters/0g-storage.js";
import { AxlAdapter } from "./adapters/axl.js";
import type { Skill } from "@moirai/shared";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

async function main() {
  const rpcUrl = required("ZG_RPC_URL");
  const privateKey = required("ZG_PRIVATE_KEY");
  const indexerUrl = required("ZG_INDEXER_URL");

  console.log("[spike] config:");
  console.log("  rpcUrl     =", rpcUrl);
  console.log("  indexerUrl =", indexerUrl);
  console.log("  provider   =", optional("ZG_PROVIDER_ADDRESS") ?? "(auto-discover cheapest TeeML)");

  const fallbackProvider = optional("FALLBACK_PROVIDER") as "anthropic" | "openai" | undefined;
  const fallbackApiKey = optional("FALLBACK_API_KEY");
  const fallbackModel = optional("FALLBACK_MODEL");
  const fallbackBaseUrl = optional("FALLBACK_BASE_URL");
  const fallback =
    fallbackProvider && fallbackApiKey && fallbackModel
      ? {
          provider: fallbackProvider,
          apiKey: fallbackApiKey,
          model: fallbackModel,
          ...(fallbackBaseUrl ? { baseUrl: fallbackBaseUrl } : {}),
        }
      : undefined;

  const providerAddress = optional("ZG_PROVIDER_ADDRESS");
  const preferredModel = optional("ZG_MODEL");
  const compute = new ZeroGComputeAdapter({
    rpcUrl,
    privateKey,
    ...(providerAddress ? { providerAddress } : {}),
    ...(preferredModel ? { preferredModel } : {}),
    ...(fallback ? { fallback } : {}),
    timeoutMs: 60_000,
  });

  const storage = new ZeroGStorageAdapter({
    indexerUrl,
    rpcUrl,
    privateKey,
    expectedReplica: 1,
  });

  console.log("\n[spike] === 0G Compute: verifiable inference ===");
  try {
    const result = await compute.infer(
      'Reply with the single word OK and nothing else.',
      { verifiable: true, maxTokens: 16 },
    );
    console.log("text     :", result.text.trim().slice(0, 100));
    console.log("hash     :", result.receipt.hash);
    console.log("model    :", result.receipt.model);
    console.log("verified :", result.receipt.verifiable);
    console.log("provider :", result.receipt.providerAddress);
  } catch (err) {
    console.error("compute infer failed:", err instanceof Error ? err.message : err);
  }

  console.log("\n[spike] === 0G Storage: putSkill ===");
  const sample: Skill = {
    id: `spike_${Date.now()}`,
    name: "spike_test_skill",
    description: "spike-only sample skill",
    preconditions: [],
    effect: "n/a",
    steps: ["upload", "download"],
    provenance: {
      inventedBy: "spike",
      inventedAt: 0,
      bornFrom: ["spike"],
      reasonReceipt: "0xspike",
      selfEvalReceipt: "0xspike",
      selfEvalScore: 0.99,
    },
  };

  try {
    await storage.putSkill(sample);
    const rootHash = storage.getSkillRoot(sample.id);
    console.log("uploaded :", sample.id);
    console.log("rootHash :", rootHash);

    console.log("\n[spike] === 0G Storage: getSkill ===");
    const fetched = await storage.getSkill(sample.id);
    console.log("fetched  :", fetched?.id, fetched?.name);
    console.log("match    :", fetched?.id === sample.id);
  } catch (err) {
    console.error("storage roundtrip failed:", err instanceof Error ? err.message : err);
  }

  console.log("\n[spike] === AXL: peer-to-peer whisper roundtrip ===");
  const axlUrl = optional("AXL_URL");
  if (!axlUrl) {
    console.log("AXL_URL not set; skipping AXL spike. Run an AXL daemon and set AXL_URL.");
  } else {
    const alice = new AxlAdapter({ selfId: "alice", axlUrl, topicPrefix: "moirai-spike" });
    const bob = new AxlAdapter({ selfId: "bob", axlUrl, topicPrefix: "moirai-spike" });

    const inboxBob: Array<{ from: string; payload: unknown }> = [];
    const inboxAlice: Array<{ from: string; payload: unknown }> = [];
    bob.subscribe((m) => {
      inboxBob.push(m);
    });
    alice.subscribe((m) => {
      inboxAlice.push(m);
    });

    try {
      await alice.connect([]);
      await bob.connect([]);

      // Wait for subscription advertisements to propagate so each side knows the other.
      await new Promise((r) => setTimeout(r, 1500));

      console.log("alice peer-id  :", alice.myPeerId());
      console.log("bob peer-id    :", bob.myPeerId());
      console.log("alice topology :", await alice.topology());
      console.log("bob topology   :", await bob.topology());

      console.log("\n[spike] alice → bob whisper");
      await alice.whisper("bob", { kind: "TEACH", skillId: "spike_test_skill" });
      await new Promise((r) => setTimeout(r, 1500));
      console.log("bob inbox     :", inboxBob);

      console.log("\n[spike] bob → broadcast");
      await bob.broadcast({ kind: "ANNOUNCE", body: "hello world" });
      await new Promise((r) => setTimeout(r, 1500));
      console.log("alice inbox   :", inboxAlice);
    } catch (err) {
      console.error("axl roundtrip failed:", err instanceof Error ? err.message : err);
    } finally {
      await alice.disconnect().catch(() => {});
      await bob.disconnect().catch(() => {});
    }
  }

  console.log("\n[spike] done");
}

main().catch((err) => {
  console.error("[spike] fatal:", err);
  process.exit(1);
});
