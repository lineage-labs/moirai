/**
 * Demo controller — inject crises into the running engine via HTTP.
 * Usage: node --import tsx/esm src/index.ts <command> [args]
 *
 * Commands:
 *   lion [targets...]     — inject a LION crisis (default: alice bob)
 *   hunger [targets...]   — inject a HUNGER crisis
 *   storm [targets...]    — inject a STORM crisis
 */

const ENGINE_URL = process.env["ENGINE_URL"] ?? "http://localhost:8766";

async function injectCrisis(type: string, targets?: string[]): Promise<void> {
  const body = JSON.stringify({ type: type.toUpperCase(), targets });
  const res = await fetch(`${ENGINE_URL}/crisis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    console.error(`[demo-controller] HTTP ${res.status}:`, await res.text());
    return;
  }
  const data = (await res.json()) as { crisisId: string };
  console.log(`[demo-controller] injected ${type} → crisisId=${data.crisisId}`);
}

const [, , cmd, ...rest] = process.argv;

if (!cmd || cmd === "help") {
  console.log(`
emergent-civ demo controller

  lion [agent...]    inject LION crisis
  hunger [agent...]  inject HUNGER crisis
  storm [agent...]   inject STORM crisis
`);
  process.exit(0);
}

const type = cmd;
const targets = rest.length > 0 ? rest : undefined;

await injectCrisis(type, targets);
