import type { AgentToEngineMessage, EngineToAgentMessage } from "@moirai/shared";

export function sendToEngine(msg: AgentToEngineMessage): void {
  if (!process.send) throw new Error("agent-runtime must run as a forked child with IPC");
  process.send(msg);
}

export function onEngineMessage(handler: (msg: EngineToAgentMessage) => void | Promise<void>): void {
  process.on("message", (raw: EngineToAgentMessage) => {
    void handler(raw);
  });
}
