export type Crisis = {
  id: string;
  type: string;
  description: string;
  startedAtTick: number;
  deadlineTicks: number;
  targets: string[];
  metadata?: Record<string, unknown>;
};
