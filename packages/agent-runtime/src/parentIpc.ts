import type { AgentToEngineMessage, EngineToAgentMessage } from "@moirai/shared";

export function sendToEngine(msg: AgentToEngineMessage): void {
  if (!process.send) return;
  try {
    process.send(msg);
  } catch {
    // ERR_IPC_CHANNEL_CLOSED — engine died; nothing to do
  }
}

export function onEngineMessage(handler: (msg: EngineToAgentMessage) => void | Promise<void>): void {
  process.on("message", (raw: EngineToAgentMessage) => {
    void handler(raw);
  });
}
