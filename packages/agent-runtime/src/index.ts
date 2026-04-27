import { loadEnvironment } from "@moirai/environment";
import { loadPersonality } from "@moirai/personality";
import type { Kernel, KernelConfig } from "@moirai/kernel";
import { EventType, type DomainEvent, type EngineToAgentMessage } from "@moirai/shared";
import { inheritOnSpawn, type DecisionDeps } from "./decisionLoop.js";
import { EventQueue } from "./eventQueue.js";
import { onEngineMessage, sendToEngine } from "./parentIpc.js";
import { SkillSet } from "./skillSet.js";

type CreateKernel = (config: KernelConfig) => Promise<Kernel>;

async function resolveCreateKernel(): Promise<CreateKernel> {
  const modulePath = process.env.MOIRAI_KERNEL_MODULE;
  if (!modulePath) throw new Error("MOIRAI_KERNEL_MODULE env var required");
  const mod = (await import(modulePath)) as { createKernel: CreateKernel };
  return mod.createKernel;
}

async function main(): Promise<void> {
  const agentId = process.env.MOIRAI_AGENT_ID;
  if (!agentId) throw new Error("MOIRAI_AGENT_ID env var required");

  let deps: DecisionDeps | undefined;
  let initDone = false;
  const queue = new EventQueue();

  sendToEngine({ kind: "READY", agentId });

  onEngineMessage(async (msg: EngineToAgentMessage) => {
    switch (msg.kind) {
      case "INIT": {
        if (initDone) return;
        initDone = true;

        const personality = await loadPersonality(msg.personalityPath);
        const environment = await loadEnvironment(msg.environmentPath);
        const createKernel = await resolveCreateKernel();
        const skills = new SkillSet();

        const kernel = await createKernel({
          agentId: msg.agentId,
          personality,
          environment,
          emit: (e: Omit<DomainEvent, "tick" | "actorId">) => {
            const event: DomainEvent = { tick: queue.currentTick, actorId: msg.agentId, ...e };
            sendToEngine({ kind: "EVENT", event });
          },
        });

        deps = { agentId: msg.agentId, personality, environment, kernel, skills, crisisCautions: new Map(), lastAttempts: new Map(), deadPeers: new Set() };

        kernel.net.subscribe(async (peerMsg) => {
          if (!deps) return;
          queue.enqueue({ kind: "PEER_MESSAGE", tick: queue.currentTick, from: peerMsg.from, payload: peerMsg.payload });
          await queue.drain(deps);
        });

        await inheritOnSpawn(deps, msg.tick, msg.predecessorIds);
        return;
      }

      case "TICK": {
        if (!deps) return;
        queue.updateTick(msg.tick);
        queue.enqueue({ kind: "TICK", tick: msg.tick, me: msg.me, nearby: msg.nearby });
        await queue.drain(deps);
        return;
      }

      case "CRISIS": {
        if (!deps) return;
        queue.updateTick(msg.tick);
        queue.enqueue({ kind: "CRISIS", priority: 3, tick: msg.tick, crisis: msg.crisis });
        await queue.drain(deps);
        return;
      }

      case "PEER_MESSAGE":
        if (!deps) return;
        queue.enqueue({ kind: "PEER_MESSAGE", tick: queue.currentTick, from: msg.from, payload: msg.payload });
        await queue.drain(deps);
        return;

      case "SHUTDOWN":
        if (deps) {
          for (const crisis of msg.deathCrises ?? []) {
            const attempt = deps.lastAttempts.get(crisis.type.toLowerCase());
            const deathPayload = { kind: "DEATH_WARNING", crisisType: crisis.type, crisisDescription: crisis.description, skillTried: attempt?.skillName, failureModes: attempt?.failureModes ?? [] };
            sendToEngine({ kind: "EVENT", event: { type: EventType.AXL_BROADCAST, tick: queue.currentTick, actorId: deps.agentId, payload: { payload: deathPayload } } });
            await deps.kernel.net.broadcast(deathPayload).catch(() => {});
          }
          if (msg.deathCrises?.length) await new Promise((r) => setTimeout(r, 800));
          await deps.kernel.shutdown?.();
        }
        process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error(`[agent-runtime] fatal:`, err);
  process.exit(1);
});
