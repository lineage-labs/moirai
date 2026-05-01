import alice from "./assets/agents/alice.svg";
import bob from "./assets/agents/bob.svg";
import charlie from "./assets/agents/charlie.svg";
import dave from "./assets/agents/dave.svg";
import eve from "./assets/agents/eve.svg";
import frank from "./assets/agents/frank.svg";
import grace from "./assets/agents/grace.svg";
import henry from "./assets/agents/henry.svg";

const AGENT_AVATARS: Record<string, string> = {
  alice,
  bob,
  charlie,
  dave,
  eve,
  frank,
  grace,
  henry,
};

export function getAgentAvatar(agentId: string): string {
  return AGENT_AVATARS[agentId] ?? alice;
}
