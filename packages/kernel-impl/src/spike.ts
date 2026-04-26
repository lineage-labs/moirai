import { ethers } from "ethers";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { ZeroGComputeAdapter } from "./adapters/0g-compute.js";
import { ZeroGStorageAdapter } from "./adapters/0g-storage.js";
import { AxlAdapter } from "./adapters/axl.js";
import type { Skill } from "@moirai/shared";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

function axlUrlsForPeers(): [string, string, string] | null {
  const u1 = optional("AXL_URL_1");
  const u2 = optional("AXL_URL_2");
  const u3 = optional("AXL_URL_3");
  const fallback = optional("AXL_URL");
  if (u1 && u2 && u3) return [u1, u2, u3];
  if (u1 && u2) return [u1, u2, u3 ?? u2];
  if (fallback) return [fallback, fallback, fallback];
  return null;
}

/**
 * Use the same keypair as the AXL daemon behind each URL.
 * If we sign with an ephemeral key while talking to docker mesh daemons, axl-pubsub
 * throws `X-From-Peer-Id ... does not match envelope.from ...`.
 */
function axlKeyPathForIndex(i: 1 | 2 | 3): string | undefined {
  const envName = `AXL_KEY_PATH_${i}` as const;
  const fromEnv = optional(envName);
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (fromEnv && !existsSync(fromEnv)) {
    console.warn(`[spike] ${envName} is set but file does not exist: ${fromEnv}`);
  }
  const fallback =
    i === 1
      ? resolve(REPO_ROOT, "docker/axl/keys/alice.pem")
      : i === 2
        ? resolve(REPO_ROOT, "docker/axl/keys/bob.pem")
        : resolve(REPO_ROOT, "docker/axl/keys/charlie.pem");
  return existsSync(fallback) ? fallback : undefined;
}

async function main() {
  const rpcUrl = required("ZG_RPC_URL");
  const privateKey = required("ZG_PRIVATE_KEY");
  const indexerUrl = required("ZG_INDEXER_URL");

  console.log("[spike] config:");
  console.log("  rpcUrl     =", rpcUrl);
  console.log("  indexerUrl =", indexerUrl);
  if (indexerUrl.includes("turbo")) {
    console.log(
      "  note       : turbo indexer = higher storage fees; standard is often better for small test blobs.",
    );
  }
  console.log("  provider   =", optional("ZG_PROVIDER_ADDRESS") ?? "(auto-discover cheapest TeeML)");

  const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
  const bal = await wallet.provider!.getBalance(wallet.address);
  console.log("  wallet     =", wallet.address);
  console.log("  balance    =", ethers.formatEther(bal), "0G (native, for gas + storage fee + compute ledger)");

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

  const transferOg = Number(optional("ZG_INFERENCE_TRANSFER_OG") ?? "1");
  const topUpWei = ethers.parseEther(Number.isFinite(transferOg) && transferOg > 0 ? String(transferOg) : "1");

  const storage = new ZeroGStorageAdapter({
    indexerUrl,
    rpcUrl,
    privateKey,
    expectedReplica: 1,
  });

  console.log("\n[spike] === 0G Compute: ensure ledger + provider sub-account ===");
  try {
    await compute.ensureComputeLedgerAndInferenceFunds({
      inferenceTopUpWei: topUpWei,
    });
    console.log("ledger / inference sub-account ready (or skipped if already funded).");
  } catch (err) {
    console.error(
      "ensureComputeLedgerAndInferenceFunds failed:",
      err instanceof Error ? err.message : err,
    );
    console.error(
      "  Hint: ledger creation needs >= 3 0G on the wallet; faucet may be insufficient — see docs/kernel/working-with-kernel.md",
    );
  }

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

    console.log("\n[spike] === 0G Compute: verifyReceipt (TEE attestation via broker) ===");
    const vr = await compute.verifyReceipt(result.receipt);
    console.log("verifyReceipt:", vr);
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
  const urls = axlUrlsForPeers();
  if (!urls) {
    console.log("AXL_URL / AXL_URL_1..3 not set; skipping AXL spike. Start the mesh (docker-compose.axl.yml) and set URLs.");
  } else {
    const aliceUrl = urls[0]!;
    const bobUrl = urls[1]!;
    const aliceKeyPath = axlKeyPathForIndex(1);
    const bobKeyPath = axlKeyPathForIndex(2);
    if (!aliceKeyPath || !bobKeyPath) {
      console.log(
        "[spike] AXL key files not found for one or both peers; adapter will use ephemeral keys (delivery can fail in multi-node mesh).",
      );
      console.log(
        "        Set AXL_KEY_PATH_1/_2 or run: pnpm axl:mesh:keys",
      );
    }
    const alice = new AxlAdapter({
      selfId: "alice",
      axlUrl: aliceUrl,
      topicPrefix: "moirai-spike",
      ...(aliceKeyPath ? { privateKeyPath: aliceKeyPath } : {}),
    });
    const bob = new AxlAdapter({
      selfId: "bob",
      axlUrl: bobUrl,
      topicPrefix: "moirai-spike",
      ...(bobKeyPath ? { privateKeyPath: bobKeyPath } : {}),
    });

    const inboxBob: Array<{ from: string; payload: unknown }> = [];
    const inboxAlice: Array<{ from: string; payload: unknown }> = [];
    bob.subscribe((m) => {
      inboxBob.push(m);
    });
    alice.subscribe((m) => {
      inboxAlice.push(m);
    });

    try {
      console.log("  alice axlUrl =", aliceUrl);
      console.log("  bob   axlUrl =", bobUrl);
      await alice.connect([]);
      await bob.connect([]);

      const mesh = aliceUrl !== bobUrl;
      const topoDeadline = Date.now() + (mesh ? 45_000 : 5_000);
      while (Date.now() < topoDeadline) {
        const t = await alice.topology();
        if (t.includes("bob")) break;
        await new Promise((r) => setTimeout(r, 400));
      }

      // Extra settle after topology sees bob (sub_ad + pollers).
      await new Promise((r) => setTimeout(r, mesh ? 800 : 1500));

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
