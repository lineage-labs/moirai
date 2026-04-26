export type Crisis = {
  id: string;
  type: string;
  description: string;
  startedAt: number;
  deadlineTick: number;
  affectedAgents: string[];
};
