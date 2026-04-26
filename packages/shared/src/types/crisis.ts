export type Crisis = {
  id: string;
  type: string;
  description: string;
  startedAtTick: number;
  deadlineTicks: number;
  affectedAgents: string[];
  metadata?: Record<string, unknown>;
};
