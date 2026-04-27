import { seedEnvironmentPath } from "@moirai/environment";
import { seedPersonalityPath } from "@moirai/personality";

export type EngineConfig = {
  worldId: string;
  environmentPath: string;
  agents: { agentId: string; personalityPath: string }[];
  tickIntervalMs: number;
  maxTicks: number;
  wsPort: number;
  /** Personality IDs reserved for late-spawn (inheritance-demo) agents. */
  inheritorPool: string[];
  episodePersistenceDir: string;
  /** Load the latest saved episode on boot (default: false — always start fresh). */
  resumeFromEpisode: boolean;
};

const DEFAULT_AGENT_IDS = ["alice", "bob", "cara"];
const DEFAULT_INHERITOR_POOL = ["dave", "eve"];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const initialIds = (env.MOIRAI_AGENTS ?? DEFAULT_AGENT_IDS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const inheritorPool = (env.MOIRAI_INHERITORS ?? DEFAULT_INHERITOR_POOL.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

  const worldId = env.MOIRAI_WORLD ?? "savannah";

  return {
    worldId,
    environmentPath: env.MOIRAI_ENV_PATH ?? seedEnvironmentPath(worldId),
    agents: initialIds.map((id) => ({ agentId: id, personalityPath: seedPersonalityPath(id) })),
    tickIntervalMs: Number(env.MOIRAI_TICK_MS ?? 250),
    maxTicks: Number(env.MOIRAI_MAX_TICKS ?? 400),
    wsPort: Number(env.MOIRAI_WS_PORT ?? 7717),
    inheritorPool,
    episodePersistenceDir: env.MOIRAI_EPISODE_DIR ?? "/tmp/moirai-episodes",
    resumeFromEpisode: env.MOIRAI_RESUME === "true",
  };
}
