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
  if (AGENT_AVATARS[agentId]) return AGENT_AVATARS[agentId]!;
  // Imported agents have IDs like "frank-124" — extract the personality prefix
  const base = agentId.split("-")[0] ?? agentId;
  return AGENT_AVATARS[base] ?? alice;
}
