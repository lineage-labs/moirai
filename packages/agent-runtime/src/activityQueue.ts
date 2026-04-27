// // packages/agent-runtime/src/activityQueue.ts
// import type { AgentAction } from "@moirai/shared";

// type ActivityKind = "FORAGE" | "FARM" | "REST" | "SOCIALIZE" | "EXPERIMENT";

// type InProgress = {
//   action: AgentAction;
//   startedTick: number;
//   durationTicks: number;
// };

// export class ActivityQueue {
//   private current: InProgress | null = null;
//   private interrupted: InProgress | null = null;

//   start(action: AgentAction, tick: number, durationTicks: number): void {
//     this.current = { action, startedTick: tick, durationTicks };
//   }

//   tick(currentTick: number): AgentAction | null {
//     if (!this.current) return null;
//     const elapsed = currentTick - this.current.startedTick;
//     if (elapsed >= this.current.durationTicks) {
//       this.current = null;
//       return null;
//     }
//     return this.current.action;
//   }

//   interrupt(): AgentAction | null {
//     if (!this.current) return null;
//     this.interrupted = this.current;
//     this.current = null;
//     return this.interrupted.action;
//   }

//   resume(tick: number): void {
//     if (!this.interrupted) return;
//     this.current = { ...this.interrupted, startedTick: tick };
//     this.interrupted = null;
//   }

//   isIdle(): boolean {
//     return this.current === null;
//   }

//   currentKind(): ActivityKind | null {
//     if (!this.current) return null;
//     const k = this.current.action.kind;
//     if (["FORAGE", "FARM", "REST", "SOCIALIZE", "EXPERIMENT"].includes(k)) return k as ActivityKind;
//     return null;
//   }
// }
