import { seedEnvironmentPath } from "@moirai/environment";
import { seedPersonalityPath } from "@moirai/personality";

export type EngineConfig = {
  worldId: string;
  environmentPath: string;
  agents: { agentId: string; personalityPath: string }[];
  tickIntervalMs: number;
  maxTicks: number;
  wsPort: number;
  /** Comma-separated agentId:tick pairs that force-die that agent at that tick (for demo). */
  forcedDeaths: { agentId: string; tick: number }[];
  /** Personality IDs reserved for late-spawn (inheritance-demo) agents. */
  inheritorPool: string[];
  episodePersistenceDir: string;
  devStorageDir?: string;
};

const DEFAULT_AGENT_IDS = ["alice", "bob", "cara"];
const DEFAULT_INHERITOR_POOL = ["dave", "eve"];

function parseForcedDeaths(s: string | undefined): EngineConfig["forcedDeaths"] {
  if (!s) return [{ agentId: "alice", tick: 80 }];
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [id, tick] = p.split(":");
      if (!id || !tick) throw new Error(`bad forced-death entry: ${p}`);
      return { agentId: id, tick: Number(tick) };
    });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const initialIds = (env.MOIRAI_AGENTS ?? DEFAULT_AGENT_IDS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const inheritorPool = (env.MOIRAI_INHERITORS ?? DEFAULT_INHERITOR_POOL.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

  const worldId = env.MOIRAI_WORLD ?? "savannah";

  return {
    worldId,
    environmentPath: env.MOIRAI_ENV_PATH ?? seedEnvironmentPath(worldId),
    agents: initialIds.map((id) => ({ agentId: id, personalityPath: seedPersonalityPath(id) })),
    tickIntervalMs: Number(env.MOIRAI_TICK_MS ?? 250),
    maxTicks: Number(env.MOIRAI_MAX_TICKS ?? 200),
    wsPort: Number(env.MOIRAI_WS_PORT ?? 7717),
    forcedDeaths: parseForcedDeaths(env.MOIRAI_FORCED_DEATHS),
    inheritorPool,
    episodePersistenceDir: env.MOIRAI_EPISODE_DIR ?? "/tmp/moirai-episodes",
    ...(env.MOIRAI_DEV_STORAGE ? { devStorageDir: env.MOIRAI_DEV_STORAGE } : {}),
  };
}
