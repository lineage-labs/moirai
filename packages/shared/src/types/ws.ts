import type { DomainEvent } from "./event.js";
import type { WorldState } from "./world.js";

export type WsMessage =
  | { kind: "WORLD"; state: WorldState }
  | { kind: "EVENT"; event: DomainEvent }
  | { kind: "RECEIPT"; skillId: string; reasonReceipt: string; selfEvalReceipt: string; score: number };
