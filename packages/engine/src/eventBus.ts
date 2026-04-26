import type { DomainEvent } from "@moirai/shared";

export type EventListener = (event: DomainEvent) => void;

/** In-memory dispatch only. Persistence to 0G is the agents' kernels' job. */
export class EventBus {
  private log: DomainEvent[] = [];
  private listeners = new Set<EventListener>();

  emit(event: DomainEvent): void {
    this.log.push(event);
    for (const l of this.listeners) l(event);
  }

  subscribe(l: EventListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  history(): readonly DomainEvent[] {
    return this.log;
  }
}
