import crisisStarted from "./assets/event-icons/crisis-started.svg";
import crisisOver from "./assets/event-icons/crisis-over.svg";
import crisisResolved from "./assets/event-icons/crisis-resolved.svg";
import agentRescued from "./assets/event-icons/agent-rescued.svg";
import reasoning from "./assets/event-icons/reasoning.svg";
import skillProposed from "./assets/event-icons/skill-proposed.svg";
import selfEval from "./assets/event-icons/self-eval.svg";
import evalResult from "./assets/event-icons/eval-result.svg";
import skillAccepted from "./assets/event-icons/skill-accepted.svg";
import skillRejected from "./assets/event-icons/skill-rejected.svg";
import skillDeclined from "./assets/event-icons/skill-declined.svg";
import axlMessage from "./assets/event-icons/axl-message.svg";
import skillTaught from "./assets/event-icons/skill-taught.svg";
import skillLearned from "./assets/event-icons/skill-learned.svg";
import skillInherited from "./assets/event-icons/skill-inherited.svg";
import agentSpawned from "./assets/event-icons/agent-spawned.svg";
import agentDied from "./assets/event-icons/agent-died.svg";

const EVENT_ICONS: Record<string, string> = {
  CRISIS_STARTED: crisisStarted,
  CRISIS_OVER: crisisOver,
  CRISIS_RESOLVED: crisisResolved,
  AGENT_RESCUED: agentRescued,
  REASONING_STARTED: reasoning,
  SKILL_PROPOSED: skillProposed,
  SELF_EVAL_STARTED: selfEval,
  SELF_EVAL_RESULT: evalResult,
  SKILL_ACCEPTED: skillAccepted,
  SKILL_REJECTED: skillRejected,
  SKILL_DECLINED: skillDeclined,
  AXL_MESSAGE: axlMessage,
  SKILL_TAUGHT: skillTaught,
  SKILL_LEARNED: skillLearned,
  SKILL_INHERITED: skillInherited,
  AGENT_SPAWNED: agentSpawned,
  AGENT_DIED: agentDied,
};

export function getEventIcon(kind: string): string | undefined {
  return EVENT_ICONS[kind];
}
