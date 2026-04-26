import { loadEnvironment } from "@moirai/environment";
import { loadPersonality } from "@moirai/personality";
import type { Kernel, KernelConfig } from "@moirai/kernel";
import { EventType, type DomainEvent, type EngineToAgentMessage, type Environment, type Personality } from "@moirai/shared";
import { inheritOnSpawn, type CautionEntry } from "./decisionLoop.js";
import { EventQueue } from "./eventQueue.js";
import { onEngineMessage, sendToEngine } from "./parentIpc.js";
import { SkillSet } from "./skillSet.js";
import { ActivityQueue } from "./activityQueue.js";

type CreateKernel = (config: KernelConfig) => Promise<Kernel>;

type AgentState = {
  agentId: string;
  personality: Personality;
  environment: Environment;
  kernel: Kernel;
  skills: SkillSet;
  knownPeerIds: string[];
  activityQueue: ActivityQueue;
  cautionList: CautionEntry[];
};

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

  let state: AgentState | undefined;
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
        const activityQueue = new ActivityQueue();

        const kernel = await createKernel({
          agentId: msg.agentId,
          personality,
          environment,
          adapters: {} as KernelConfig["adapters"],
          emit: (e) => {
            const event: DomainEvent = { ...e, tick: msg.tick, actorId: msg.agentId };
            sendToEngine({ kind: "EVENT", event });
          },
        });

        state = {
          agentId: msg.agentId,
          personality,
          environment,
          kernel,
          skills,
          knownPeerIds: msg.peerIds,
          activityQueue,
          cautionList: [],
        };

        kernel.net.subscribe(async (peerMsg) => {
          if (!state) return;
          queue.enqueue({ kind: "PEER_MESSAGE", tick: queue.currentTick, from: peerMsg.from, payload: peerMsg.payload });
          await queue.drain(state);
        });

        // Report persisted social graph to engine so it can bootstrap its dispatch cache
        const community = await kernel.storage.getAgentSocialGraph(msg.agentId);
        if (community.length > 0) {
          sendToEngine({
            kind: "EVENT",
            event: {
              type: EventType.SOCIAL_GRAPH_LOADED,
              tick: msg.tick,
              actorId: msg.agentId,
              payload: { members: community },
            },
          });
        }

        await inheritOnSpawn(state, msg.tick, msg.predecessorIds);
        return;
      }

      case "TICK": {
        if (!state) return;
        queue.updateTick(msg.tick);
        queue.enqueue({ kind: "TICK", tick: msg.tick, me: msg.me, nearby: msg.nearby });
        await queue.drain(state);
        return;
      }

      case "CRISIS": {
        if (!state) return;
        queue.updateTick(msg.tick);
        queue.enqueue({ kind: "CRISIS", priority: 3, tick: msg.tick, crisis: msg.crisis });
        await queue.drain(state);
        return;
      }

      case "PEER_MESSAGE":
        // The kernel's network adapter is responsible for delivering this to its
        // subscribers. The dev IPC adapter listens to engine messages directly via
        // its own onEngineMessage hook; nothing to do here.
        return;

      case "SHUTDOWN":
        if (state) await state.kernel.shutdown();
        process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error(`[agent-runtime] fatal:`, err);
  process.exit(1);
});
