export type Crisis = {
  id: string;
  type: string;
  description: string;
  startedAtTick: number;
  deadlineTicks: number;
  affectedAgents: string[];
  position?: { x: number; y: number };
  metadata?: Record<string, unknown>;
};
