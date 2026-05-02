import { createServer } from "node:http";
import type { Crisis, Event } from "@moirai/shared";
import type { AgentEntry, SkillEntry } from "./types.js";
import { inftAdapter, marketplaceAdapter, WORLD_ID } from "./inft.js";

type HttpContext = {
  port: number;
  agents: Map<string, AgentEntry>;
  skills: Map<string, SkillEntry>;
  activeCrises: Map<string, Crisis>;
  resolvedCrises: Set<string>;
  broadcast: (ev: Event) => void;
  sendToAgent: (entry: AgentEntry, msg: unknown) => void;
  getTick: () => number;
  spawnFromNFT: (tokenId: string) => Promise<string | null>;
};

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

export function startHttpServer(ctx: HttpContext): void {
  const { port, agents, activeCrises, broadcast, sendToAgent, getTick } = ctx;

  createServer(async (req, res) => {
    const url = req.url ?? "";
    const method = req.method ?? "";

    // --- /crisis ---
    if (method === "POST" && url === "/crisis") {
      const body = JSON.parse(await readBody(req)) as { type: string; targets?: string[] };
      const tick = getTick();
      const crisisId = `${body.type}-manual-${tick}`;
      const targets = (body.targets ?? [...agents.keys()]).filter(id => agents.get(id)?.alive);
      const crisis: Crisis = {
        id: crisisId,
        type: body.type.toUpperCase(),
        description: `Manual ${body.type.toLowerCase()} crisis!`,
        startedAtTick: tick,
        deadlineTicks: 25,
        targets,
      };
      activeCrises.set(crisisId, crisis);
      broadcast({ kind: "CRISIS_STARTED", tick, actorId: "engine", payload: crisis });
      for (const targetId of targets) {
        const agent = agents.get(targetId);
        if (agent?.alive) sendToAgent(agent, { kind: "TICK", tick, crises: [crisis] });
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, crisisId }));
      return;
    }

    // --- /marketplace/list ---
    if (method === "POST" && url === "/marketplace/list") {
      if (!inftAdapter || !marketplaceAdapter) { res.writeHead(503).end(JSON.stringify({ error: "iNFT disabled" })); return; }
      const body = JSON.parse(await readBody(req)) as { tokenId: string; salePriceWei: string };
      const entry = [...agents.values()].find(a => a.tokenId === body.tokenId);
      if (!entry) { res.writeHead(400).end(JSON.stringify({ error: "agent not found" })); return; }
      try {
        // approve + list run as one atomic write-queue entry to avoid nonce conflicts
        await inftAdapter.approveAndRun(
          body.tokenId,
          process.env["MARKETPLACE_CONTRACT_ADDRESS"]!,
          () => marketplaceAdapter!.list(body.tokenId, BigInt(body.salePriceWei), WORLD_ID),
        );
        entry.listed = true;
        broadcast({ kind: "AGENT_LISTED", tick: getTick(), actorId: entry.id, payload: { tokenId: body.tokenId, salePriceWei: body.salePriceWei } });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("[engine] marketplace list failed:", err);
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // --- /marketplace/delist ---
    if (method === "POST" && url === "/marketplace/delist") {
      if (!marketplaceAdapter) { res.writeHead(503).end(JSON.stringify({ error: "iNFT disabled" })); return; }
      const body = JSON.parse(await readBody(req)) as { tokenId: string };
      const entry = [...agents.values()].find(a => a.tokenId === body.tokenId);
      try {
        await marketplaceAdapter.delist(body.tokenId);
        if (entry) entry.listed = false;
        broadcast({ kind: "AGENT_DELISTED", tick: getTick(), actorId: entry?.id ?? "engine", payload: { tokenId: body.tokenId, reason: "manual" } });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("[engine] marketplace delist failed:", err);
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // --- /marketplace/listings ---
    if (method === "GET" && url === "/marketplace/listings") {
      if (!marketplaceAdapter) { res.writeHead(503).end(JSON.stringify({ error: "iNFT disabled" })); return; }
      try {
        const listings = await marketplaceAdapter.getActiveListings();
        console.log(`[engine] marketplace listings: ${listings.length} active`);
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify(listings.map(l => ({ ...l, salePriceWei: l.salePriceWei.toString() })))
        );
      } catch (err) {
        console.error("[engine] getActiveListings failed:", err);
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // --- /marketplace/import ---
    if (method === "POST" && url === "/marketplace/import") {
      if (!inftAdapter || !marketplaceAdapter) { res.writeHead(503).end(JSON.stringify({ error: "iNFT disabled" })); return; }
      const body = JSON.parse(await readBody(req)) as { tokenId: string };
      const listings = await marketplaceAdapter.getActiveListings();
      const listing = listings.find(l => l.tokenId === body.tokenId);
      if (!listing) { res.writeHead(400).end(JSON.stringify({ error: "not listed" })); return; }
      await marketplaceAdapter.buy(body.tokenId, listing.salePriceWei);
      // spawnFromNFT triggered by Transfer event listener
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, tokenId: body.tokenId }));
      return;
    }

    res.writeHead(404).end();
  }).listen(port, () => console.log(`[engine] HTTP on :${port}`));
}
