import { create } from "zustand";

// Minimal event types mirrored locally (no workspace import needed at runtime)
type EventKind =
  | "WORLD_TICK"
  | "AGENT_SPAWNED"
  | "AGENT_DIED"
  | "AGENT_HUNGER"
  | "CRISIS_STARTED"
  | "CRISIS_RESOLVED"
  | "REASONING_STARTED"
  | "SKILL_PROPOSED"
  | "SELF_EVAL_STARTED"
  | "SELF_EVAL_RESULT"
  | "SKILL_ACCEPTED"
  | "SKILL_REJECTED"
  | "AXL_MESSAGE"
  | "SKILL_TAUGHT"
  | "SKILL_LEARNED"
  | "SKILL_INHERITED"
  | "SKILL_DECLINED"
  | "CRISIS_OVER";

export type GameEvent = {
  kind: EventKind;
  tick: number;
  actorId: string;
  receiptHash?: string;
  payload?: Record<string, unknown>;
};

export type AgentInfo = {
  id: string;
  alive: boolean;
  knownSkillIds: string[];
  status: "idle" | "reasoning" | "crisis";
  position: { x: number; y: number };
  hunger?: { current: number; threshold: number };
};

export type SkillInfo = {
  id: string;
  name: string;
  inventedBy: string;
  tick: number;
  reasonReceipt?: string;
  selfEvalReceipt?: string;
  selfEvalScore?: number;
  verifiable: boolean;
};

export type CrisisInfo = {
  id: string;
  type: string;
  targets: string[];
  resolved: boolean;
};

export type EdgeInfo = {
  id: string;
  from: string;
  to: string;
  label: string;
};

type Store = {
  agents: Record<string, AgentInfo>;
  events: GameEvent[];
  skills: Record<string, SkillInfo>;
  crises: Record<string, CrisisInfo>;
  edges: EdgeInfo[];
  tick: number;

  handleEvent(ev: GameEvent): void;
};

const POSITIONS: Record<string, { x: number; y: number }> = {
  alice: { x: 150, y: 120 },
  bob: { x: 420, y: 80 },
  charlie: { x: 650, y: 200 },
  dave: { x: 300, y: 320 },
  eve: { x: 500, y: 350 },
};

function positionFor(id: string, agentCount: number): { x: number; y: number } {
  if (POSITIONS[id]) return POSITIONS[id]!;
  const angle = (agentCount * 2 * Math.PI) / 5;
  return { x: 400 + 250 * Math.cos(angle), y: 250 + 180 * Math.sin(angle) };
}

export const useStore = create<Store>((set, get) => ({
  agents: {},
  events: [],
  skills: {},
  crises: {},
  edges: [],
  tick: 0,

  handleEvent(ev: GameEvent) {
    set((state) => {
      const agents = { ...state.agents };
      const skills = { ...state.skills };
      const crises = { ...state.crises };
      const edges = [...state.edges];
      // AGENT_HUNGER fires every tick — update state but don't spam the feed
      const events = ev.kind === "AGENT_HUNGER"
        ? state.events
        : [...state.events, ev].slice(-200);
      let tick = state.tick;

      if (ev.kind === "WORLD_TICK") {
        tick = ev.tick;
      }

      if (ev.kind === "AGENT_SPAWNED") {
        const count = Object.keys(agents).length;
        agents[ev.actorId] = {
          id: ev.actorId,
          alive: true,
          knownSkillIds: [],
          status: "idle",
          position: positionFor(ev.actorId, count),
        };
      }

      if (ev.kind === "AGENT_DIED") {
        const a = agents[ev.actorId];
        if (a) agents[ev.actorId] = { ...a, alive: false, status: "idle" };
      }

      if (ev.kind === "AGENT_HUNGER" && ev.payload) {
        const { hunger, threshold } = ev.payload as { hunger: number; threshold: number };
        const a = agents[ev.actorId];
        if (a) agents[ev.actorId] = { ...a, hunger: { current: hunger, threshold } };
      }

      if (ev.kind === "CRISIS_STARTED" && ev.payload) {
        const p = ev.payload as { id: string; type: string; targets: string[] };
        crises[p.id] = { id: p.id, type: p.type, targets: p.targets, resolved: false };
        for (const t of p.targets) {
          const a = agents[t];
          if (a?.alive) agents[t] = { ...a, status: "crisis" };
        }
      }

      if (ev.kind === "CRISIS_RESOLVED" && ev.payload) {
        const crisisId = ev.payload["crisisId"] as string;
        if (ev.actorId === "engine") {
          const c = crises[crisisId];
          if (c) crises[crisisId] = { ...c, resolved: true };
        }
        const a = agents[ev.actorId];
        if (a) agents[ev.actorId] = { ...a, status: "idle" };
      }

      if (ev.kind === "CRISIS_OVER" && ev.payload) {
        const crisisId = ev.payload["crisisId"] as string;
        const c = crises[crisisId];
        if (c) crises[crisisId] = { ...c, resolved: true };
        const survived = ev.payload["survived"] as string[];
        const killed = ev.payload["killed"] as string[];
        for (const id of survived) {
          const a = agents[id];
          if (a) agents[id] = { ...a, status: "idle" };
        }
        for (const id of killed) {
          const a = agents[id];
          if (a) agents[id] = { ...a, alive: false, status: "idle" };
        }
      }

      if (ev.kind === "REASONING_STARTED") {
        const a = agents[ev.actorId];
        if (a) agents[ev.actorId] = { ...a, status: "reasoning" };
      }

      if (ev.kind === "SKILL_ACCEPTED" && ev.payload) {
        const skill = ev.payload["skill"] as {
          id: string;
          name: string;
          provenance: {
            inventedBy: string;
            inventedAt: number;
            reasonReceipt: string;
            selfEvalReceipt: string;
            selfEvalScore: number;
          };
        };
        skills[skill.id] = {
          id: skill.id,
          name: skill.name,
          inventedBy: skill.provenance.inventedBy,
          tick: skill.provenance.inventedAt,
          reasonReceipt: skill.provenance.reasonReceipt,
          selfEvalReceipt: skill.provenance.selfEvalReceipt,
          selfEvalScore: skill.provenance.selfEvalScore,
          verifiable: !!ev.receiptHash,
        };
        const a = agents[ev.actorId];
        if (a) {
          agents[ev.actorId] = {
            ...a,
            knownSkillIds: [...a.knownSkillIds, skill.id],
            status: "idle",
          };
        }
      }

      if (ev.kind === "SKILL_LEARNED" && ev.payload) {
        const { from, skillId } = ev.payload as { from: string; skillId: string };
        const a = agents[ev.actorId];
        if (a && !a.knownSkillIds.includes(skillId)) {
          agents[ev.actorId] = { ...a, knownSkillIds: [...a.knownSkillIds, skillId] };
        }
        const edgeId = `teach-${from}-${ev.actorId}-${skillId}`;
        if (!edges.find((e) => e.id === edgeId)) {
          edges.push({ id: edgeId, from, to: ev.actorId, label: `taught ${skillId.slice(0, 6)}` });
        }
      }

      if (ev.kind === "SKILL_INHERITED" && ev.payload) {
        const { skillId } = ev.payload as { skillId: string };
        const a = agents[ev.actorId];
        if (a && !a.knownSkillIds.includes(skillId)) {
          agents[ev.actorId] = { ...a, knownSkillIds: [...a.knownSkillIds, skillId] };
        }
      }

      return { agents, skills, crises, edges, events, tick };
    });
  },
}));

export function connectWs(url: string): void {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data as string) as GameEvent;
      useStore.getState().handleEvent(ev);
    } catch {
      // ignore
    }
  };
  ws.onclose = () => setTimeout(() => connectWs(url), 2000);
}
