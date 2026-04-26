export type CrisisScheduleEntry = {
  tick: number;
  type: string;
  description: string;
  targets?: string[];
  deadlineTicks: number;
};

export type HiddenRule = {
  id: string;
  trigger: {
    activity: "FORAGE" | "FARM" | "REST" | "SOCIALIZE" | "EXPERIMENT";
    condition: string;
  };
  effect: string;
  multiplier: number;
};

export type Environment = {
  id: string;
  physics: string[];
  resources: string[];
  topology: "open" | "ring" | "hub";
  crisisSchedule: CrisisScheduleEntry[];
  hiddenRules?: HiddenRule[];
};
