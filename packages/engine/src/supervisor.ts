import { fork, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToEngineMessage, EngineToAgentMessage } from "@moirai/shared";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME_ENTRY = resolve(HERE, "..", "..", "agent-runtime", "src", "index.ts");

export type AgentHandle = {
  agentId: string;
  send: (msg: EngineToAgentMessage) => void;
  kill: () => void;
};

export type SpawnOpts = {
  agentId: string;
  personalityPath: string;
  environmentPath: string;
  initialPeerIds: string[];
  tick: number;
  predecessorIds?: string[];
};

export type AgentMessageHandler = (agentId: string, msg: AgentToEngineMessage) => void;

export class Supervisor {
  private children = new Map<string, ChildProcess>();
  private onMessage: AgentMessageHandler;
  private onExit: (agentId: string) => void;

  constructor(opts: { onMessage: AgentMessageHandler; onExit: (agentId: string) => void }) {
    this.onMessage = opts.onMessage;
    this.onExit = opts.onExit;
  }

  spawn(opts: SpawnOpts): AgentHandle {
    const child = fork(RUNTIME_ENTRY, [], {
      execArgv: ["--import", "tsx"],
      stdio: ["pipe", "inherit", "inherit", "ipc"],
      env: {
        ...process.env,
        MOIRAI_AGENT_ID: opts.agentId,
      },
    });

    child.on("message", (raw) => {
      this.onMessage(opts.agentId, raw as AgentToEngineMessage);
    });

    child.on("exit", () => {
      this.children.delete(opts.agentId);
      this.onExit(opts.agentId);
    });

    this.children.set(opts.agentId, child);

    const handle: AgentHandle = {
      agentId: opts.agentId,
      send: (msg) => {
        if (child.connected) child.send(msg);
      },
      kill: () => {
        if (child.connected) child.send({ kind: "SHUTDOWN" } satisfies EngineToAgentMessage);
        child.kill();
      },
    };

    const initMsg = {
      kind: "INIT" as const,
      agentId: opts.agentId,
      personalityPath: opts.personalityPath,
      environmentPath: opts.environmentPath,
      peerIds: opts.initialPeerIds,
      tick: opts.tick,
      ...(opts.predecessorIds ? { predecessorIds: opts.predecessorIds } : {}),
    };
    handle.send(initMsg);

    return handle;
  }

  send(agentId: string, msg: EngineToAgentMessage): void {
    const child = this.children.get(agentId);
    if (child?.connected) child.send(msg);
  }

  killAll(): void {
    for (const [, child] of this.children) {
      if (child.connected) child.send({ kind: "SHUTDOWN" } satisfies EngineToAgentMessage);
      child.kill();
    }
    this.children.clear();
  }

  alive(agentId: string): boolean {
    return this.children.has(agentId);
  }
}
