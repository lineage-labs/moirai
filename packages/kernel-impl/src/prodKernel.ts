/**
 * Self-bootstrapping production kernel factory.
 *
 * Loaded dynamically by agent-runtime when MOIRAI_KERNEL_MODE=prod.
 * Set MOIRAI_KERNEL_MODULE to the absolute path of this file.
 *
 * Resolves per-agent AXL node and keypair automatically:
 *   alice → AXL_URL_1  + docker/axl/keys/alice.pem
 *   bob   → AXL_URL_2  + docker/axl/keys/bob.pem
 *   other → AXL_URL_3  + docker/axl/keys/charlie.pem
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Kernel, KernelConfig } from "@moirai/kernel";
import { createKernel as implCreate } from "./index.js";
import { ZeroGComputeAdapter } from "./adapters/0g-compute.js";
import { ZeroGStorageAdapter } from "./adapters/0g-storage.js";
import { AxlAdapter } from "./adapters/axl.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const AXL_KEYS_DIR = resolve(REPO_ROOT, "docker/axl/keys");

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[prodKernel] missing required env var: ${name}`);
  return v;
}
const opt = (name: string): string | undefined => process.env[name] || undefined;

function axlUrlFor(id: string): string {
  return (
    opt(`MOIRAI_AXL_URL_${id}`) ??
    (id === "alice" ? opt("AXL_URL_1") :
     id === "bob"   ? opt("AXL_URL_2") :
     id === "dave"  ? opt("AXL_URL_4") :
     id === "eve"   ? opt("AXL_URL_5") :
                      opt("AXL_URL_3")) ??
    opt("AXL_URL_1") ??
    "http://127.0.0.1:19002"
  );
}

function axlKeyFor(id: string): string | undefined {
  const explicit = opt(`MOIRAI_AXL_KEY_PATH_${id}`);
  if (explicit && existsSync(explicit)) return explicit;
  // cara's daemon is named "charlie"; all other agents use their own name
  const pemName = id === "cara" ? "charlie" : id;
  const path = resolve(AXL_KEYS_DIR, `${pemName}.pem`);
  return existsSync(path) ? path : undefined;
}

export async function createKernel(config: KernelConfig): Promise<Kernel> {
  const agentId = config.agentId ?? req("MOIRAI_AGENT_ID");
  const rpcUrl     = req("ZG_RPC_URL");
  const privateKey = req("ZG_PRIVATE_KEY");
  const indexerUrl = req("ZG_INDEXER_URL");
  const axlUrl     = axlUrlFor(agentId);
  const axlKey     = axlKeyFor(agentId);

  const fallbackProvider = opt("FALLBACK_PROVIDER") as "anthropic" | "openai" | undefined;
  const fallbackApiKey   = opt("FALLBACK_API_KEY");
  const fallbackModel    = opt("FALLBACK_MODEL");
  const fallback =
    fallbackProvider && fallbackApiKey && fallbackModel
      ? { provider: fallbackProvider, apiKey: fallbackApiKey, model: fallbackModel }
      : undefined;

  const providerAddress = opt("ZG_PROVIDER_ADDRESS");
  const preferredModel  = opt("ZG_MODEL");
  const compute = new ZeroGComputeAdapter({
    rpcUrl,
    privateKey,
    ...(providerAddress ? { providerAddress } : {}),
    ...(preferredModel  ? { preferredModel }  : {}),
    ...(fallback        ? { fallback }        : {}),
    timeoutMs: 60_000,
  });

  const storage = new ZeroGStorageAdapter({
    indexerUrl,
    rpcUrl,
    privateKey,
    expectedReplica: 1,
  });

  const net = new AxlAdapter({
    selfId: agentId,
    axlUrl,
    ...(axlKey ? { privateKeyPath: axlKey } : {}),
    topicPrefix: "moirai",
    pollIntervalMs: 300,
    advertiseIntervalMs: 600,
  });

  await net.connect([]);
  process.stderr.write(
    `[kernel:${agentId}] AXL connected  url=${axlUrl}  key=${axlKey ?? "ephemeral"}\n`,
  );

  const innerKernel = await implCreate({ ...config, compute, storage, network: net });

  return {
    ...innerKernel,
    shutdown: async () => {
      await net.disconnect().catch(() => {});
      await innerKernel.shutdown?.();
    },
  };
}
