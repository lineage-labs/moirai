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
};
