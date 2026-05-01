import alice from "../../personality/src/personalities/alice.json";
import bob from "../../personality/src/personalities/bob.json";
import charlie from "../../personality/src/personalities/charlie.json";
import dave from "../../personality/src/personalities/dave.json";
import eve from "../../personality/src/personalities/eve.json";
import frank from "../../personality/src/personalities/frank.json";
import grace from "../../personality/src/personalities/grace.json";
import henry from "../../personality/src/personalities/henry.json";

type PersonalitySummary = {
  id: string;
  name: string;
  traits?: string[];
  inventory?: string[];
};

const PERSONALITIES: Record<string, PersonalitySummary> = {
  alice,
  bob,
  charlie,
  dave,
  eve,
  frank,
  grace,
  henry,
};

export function getPersonality(agentId: string): PersonalitySummary {
  return PERSONALITIES[agentId] ?? {
    id: agentId,
    name: agentId,
    inventory: [],
    traits: [],
  };
}

export function getAgentInventory(agentId: string): string[] {
  return getPersonality(agentId).inventory ?? [];
}
