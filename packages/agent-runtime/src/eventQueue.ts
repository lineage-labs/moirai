import type { AgentInWorld, Crisis } from "@moirai/shared";
import { handleCrisis, handlePeerMessage, handleTick, type DecisionDeps } from "./decisionLoop.js";

// ---------------------------------------------------------------------------
// Typed queue entries — every incoming engine/peer event becomes one of these
// ---------------------------------------------------------------------------

type CrisisEntry = { kind: "CRISIS"; priority: number; tick: number; crisis: Crisis };
type PeerEntry   = { kind: "PEER_MESSAGE"; priority: number; tick: number; from: string; payload: unknown };
type TickEntry   = { kind: "TICK"; priority: number; tick: number; me: AgentInWorld; nearby: AgentInWorld[] };

type QueuedEvent = CrisisEntry | PeerEntry | TickEntry;

// ---------------------------------------------------------------------------
// Priority constants
//   1 - DEATH_WARNING      instant community safety signal
//   2 - TEACH (crisis up)  absorb knowledge before facing danger
//   3 - CRISIS             life-threatening, handled after available knowledge
//   4 - TEACH (normal)     learn at leisure
//   5 - TICK               routine life decision
// ---------------------------------------------------------------------------

const P = {
  DEATH_WARNING:   1,
  TEACH_ELEVATED:  2,
  CRISIS:          3,
  TEACH_NORMAL:    4,
  TICK:            5,
} as const;

export class EventQueue {
  private queue: QueuedEvent[] = [];
  private processing = false;
  private pendingCrisisCount = 0;
  private _currentTick = 0;

  get currentTick(): number { return this._currentTick; }

  // Called by index.ts whenever it knows the current tick (TICK / CRISIS messages)
  updateTick(tick: number): void {
    if (tick > this._currentTick) this._currentTick = tick;
  }

  enqueue(raw: CrisisEntry | Omit<PeerEntry, "priority"> | Omit<TickEntry, "priority">): void {
    const priority = this.computePriority(raw);
    const event = { ...raw, priority } as QueuedEvent;

    if (event.kind === "CRISIS") {
      this.pendingCrisisCount++;
      // Elevate every waiting peer message to just before the crisis so the
      // agent absorbs available community knowledge before facing danger.
      for (const q of this.queue) {
        if (q.kind === "PEER_MESSAGE" && q.priority > P.TEACH_ELEVATED) {
          q.priority = P.TEACH_ELEVATED;
        }
      }
    }

    this.insertSorted(event);
  }

  // Drains the queue sequentially. Re-entrant calls while draining are no-ops
  // — the active loop will process any events enqueued in the meantime.
  async drain(deps: DecisionDeps): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        if (event.kind === "CRISIS") {
          this.pendingCrisisCount = Math.max(0, this.pendingCrisisCount - 1);
        }
        await this.dispatch(event, deps);
      }
    } finally {
      this.processing = false;
    }
  }

  private computePriority(raw: { kind: string; payload?: unknown }): number {
    if (raw.kind === "PEER_MESSAGE") {
      const payload = raw.payload as { kind?: string } | undefined;
      if (payload?.kind === "DEATH_WARNING") return P.DEATH_WARNING;
      return this.pendingCrisisCount > 0 ? P.TEACH_ELEVATED : P.TEACH_NORMAL;
    }
    if (raw.kind === "CRISIS") return P.CRISIS;
    if (raw.kind === "TICK")   return P.TICK;
    return 99;
  }

  private insertSorted(event: QueuedEvent): void {
    const idx = this.queue.findIndex((q) => q.priority > event.priority);
    if (idx === -1) this.queue.push(event);
    else this.queue.splice(idx, 0, event);
  }

  private async dispatch(event: QueuedEvent, deps: DecisionDeps): Promise<void> {
    try {
      switch (event.kind) {
        case "CRISIS":
          await handleCrisis(deps, event.tick, event.crisis);
          break;
        case "PEER_MESSAGE":
          await handlePeerMessage(deps, event.tick, { from: event.from, payload: event.payload });
          break;
        case "TICK":
          await handleTick(deps, event.tick, event.me, event.nearby);
          break;
      }
    } catch (err) {
      // Skill not acquired — crisis stays unresolved, agent dies at deadline via normal expiry path
      process.stderr.write(`[${deps.agentId}] ${event.kind} error (crisis unresolved): ${err}\n`);
    }
  }
}
