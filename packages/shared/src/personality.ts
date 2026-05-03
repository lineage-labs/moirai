export type Personality = {
  id: string;
  name: string;
  traits: string[];
  risk: number;
  innateSkills: string[];
  promptFragments: {
    reasoning?: string;
    selfEval?: string;
  };
  inventory?: string[];
  hunger?: {
    rate: number;      // hunger units gained per tick
    threshold: number; // hunger level at which agent dies
  };
};
