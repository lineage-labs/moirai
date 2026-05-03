import type { GameEvent } from "./store";

export type TickHeadline = {
  kind: GameEvent["kind"] | "IDLE";
  title: string;
  actorId: string;
  tick: number;
};

const PRIORITY: Partial<Record<GameEvent["kind"], number>> = {
  CRISIS_STARTED: 100,
  AGENT_DIED: 90,
  SKILL_ACCEPTED: 80,
  SELF_EVAL_RESULT: 78,
  SKILL_PROPOSED: 75,
  SKILL_REJECTED: 72,
  SKILL_LEARNED: 70,
  SKILL_TAUGHT: 65,
  SKILL_DECLINED: 63,
  AGENT_RESCUED: 62,
  SKILL_INHERITED: 61,
  AGENT_SPAWNED: 60,
  CRISIS_RESOLVED: 55,
  CRISIS_OVER: 50,
  AXL_MESSAGE: 45,
};

export const MEANINGFUL_EVENT_KINDS = new Set(Object.keys(PRIORITY));

function titleForEvent(event: GameEvent): string {
  switch (event.kind) {
    case "CRISIS_STARTED": {
      const payload = event.payload as { type?: string } | undefined;
      return `${payload?.type?.toLowerCase() === "lion" ? "Lion" : payload?.type ?? "Crisis"} attack`;
    }
    case "AGENT_DIED":
      return `${event.actorId} fell`;
    case "SKILL_ACCEPTED": {
      const payload = event.payload as { skill?: { name?: string } } | undefined;
      return payload?.skill?.name ? `${event.actorId} invented ${payload.skill.name}` : `${event.actorId} learned`;
    }
    case "SKILL_LEARNED": {
      const payload = event.payload as { from?: string } | undefined;
      return `${event.actorId} learned from ${payload?.from ?? "peer"}`;
    }
    case "SKILL_TAUGHT": {
      const payload = event.payload as { to?: string } | undefined;
      return `${event.actorId} taught ${payload?.to ?? "peer"}`;
    }
    case "AGENT_SPAWNED":
      return `${event.actorId} entered`;
    case "CRISIS_RESOLVED":
      return "Crisis resolved";
    case "CRISIS_OVER":
      return "Crisis ended";
    case "SKILL_PROPOSED": {
      const payload = event.payload as { candidate?: { name?: string } } | undefined;
      return payload?.candidate?.name ? `${event.actorId} proposed ${payload.candidate.name}` : `${event.actorId} proposed skill`;
    }
    case "SELF_EVAL_RESULT": {
      const payload = event.payload as { score?: number } | undefined;
      return payload?.score != null ? `Self-eval score ${payload.score.toFixed(2)}` : "Self-eval complete";
    }
    case "SKILL_REJECTED":
      return `${event.actorId} skill rejected`;
    case "SKILL_DECLINED": {
      const payload = event.payload as { skillName?: string; reason?: string } | undefined;
      return payload?.skillName
        ? `${event.actorId} declined ${payload.skillName}`
        : `${event.actorId} declined skill`;
    }
    case "AGENT_RESCUED": {
      const payload = event.payload as { skillUsed?: string } | undefined;
      return payload?.skillUsed
        ? `${event.actorId} survived via ${payload.skillUsed}`
        : `${event.actorId} survived crisis`;
    }
    case "SKILL_INHERITED": {
      return `${event.actorId} inherited skill`;
    }
    case "AXL_MESSAGE": {
      const payload = event.payload as { to?: string } | undefined;
      return payload?.to ? `${event.actorId} → ${payload.to}` : `${event.actorId} broadcast`;
    }
    default:
      return event.kind.replace(/_/g, " ").toLowerCase();
  }
}

export function pickTickHeadline(events: GameEvent[], tick: number): TickHeadline {
  const headline = tickHeadlines(events, tick)[0];

  if (!headline) {
    return { kind: "IDLE", title: "World breathing", actorId: "world", tick: 0 };
  }

  return headline;
}

export function tickHeadlines(events: GameEvent[], tick: number, limit = 3): TickHeadline[] {
  return events
    .filter((candidate) => candidate.tick === tick && PRIORITY[candidate.kind] != null)
    .sort((a, b) => (PRIORITY[b.kind] ?? 0) - (PRIORITY[a.kind] ?? 0))
    .slice(0, limit)
    .map((event) => ({
      kind: event.kind,
      title: titleForEvent(event),
      actorId: event.actorId,
      tick: event.tick,
    }));
}

export function recentEventHeadlines(events: GameEvent[], limit = 8): TickHeadline[] {
  return events
    .filter((candidate) => MEANINGFUL_EVENT_KINDS.has(candidate.kind))
    .slice(-limit)
    .map((event) => ({
      kind: event.kind,
      title: titleForEvent(event),
      actorId: event.actorId,
      tick: event.tick,
    }));
}
