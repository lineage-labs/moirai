export type CrisisScheduleEntry = {
  tick: number;
  type: string;
  targets?: string[];
  deadlineTicks: number;
  metadata?: Record<string, unknown>;
};

export type Environment = {
  id: string;
  physics: string[];
  resources: string[];
  topology: "open" | "ring" | "hub";
  crisisSchedule: CrisisScheduleEntry[];
};
