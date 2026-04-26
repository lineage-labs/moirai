import { loadEnvironment } from "@moirai/environment";
import { loadPersonality } from "@moirai/personality";
import type { Kernel, KernelConfig } from "@moirai/kernel";
import { type DomainEvent, type EngineToAgentMessage } from "@moirai/shared";
import { inheritOnSpawn, type DecisionDeps } from "./decisionLoop.js";
import { EventQueue } from "./eventQueue.js";
import { onEngineMessage, sendToEngine } from "./parentIpc.js";
import { SkillSet } from "./skillSet.js";

type CreateKernel = (config: KernelConfig) => Promise<Kernel>;

async function resolveCreateKernel(): Promise<CreateKernel> {
  const mode = process.env.MOIRAI_KERNEL_MODE ?? "dev";
  if (mode === "prod") {
    const modulePath = process.env.MOIRAI_KERNEL_MODULE;
    if (!modulePath) throw new Error("MOIRAI_KERNEL_MODE=prod requires MOIRAI_KERNEL_MODULE");
    const mod = (await import(modulePath)) as { createKernel: CreateKernel };
    return mod.createKernel;
  }
  const dev = await import("./__dev__/devKernel.js");
  return dev.createKernel;
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
            const event: DomainEvent = { tick: msg.tick, actorId: msg.agentId, ...e };
            sendToEngine({ kind: "EVENT", event });
          },
        });

        deps = { agentId: msg.agentId, environment, kernel, skills, crisisCautions: new Map() };

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
        return;

      case "SHUTDOWN":
        if (deps) await deps.kernel.shutdown?.();
        process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error(`[agent-runtime] fatal:`, err);
  process.exit(1);
});
