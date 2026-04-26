import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorldState } from "@moirai/shared";

export type EpisodeSnapshot = {
  episodeId: number;
  savedAt: number;
  world: WorldState;
};

export function saveEpisode(snapshot: EpisodeSnapshot, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `episode-${snapshot.episodeId}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
}

export function loadLatestEpisode(dir: string): EpisodeSnapshot | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("episode-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  const latestFile = files[0];
  if (!latestFile) return null;
  return JSON.parse(readFileSync(join(dir, latestFile), "utf8")) as EpisodeSnapshot;
}

export function nextEpisodeId(dir: string): number {
  const latest = loadLatestEpisode(dir);
  return latest ? latest.episodeId + 1 : 1;
}
