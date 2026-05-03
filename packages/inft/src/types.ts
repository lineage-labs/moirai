export type AgentNFTMetadata = {
  schemaVersion: 1;

  agentId: string;
  personalityId: string;
  worldId: string;

  name: string;
  description?: string;
  symbol?: string;
  external_url?: string;
  category?: string;
  traits: string[];
  image: string; // data:image/svg+xml;base64,... embedded at mint time
  attributes?: Array<{ trait_type: string; value: string }>;

  tokenId: string;
  ancestorTokenIds: string[];
  spawnTick: number;

  // References only — full skill objects fetched from 0G Storage on spawn
  skills: Array<{
    id: string;
    name: string;
    rootHash: string;
  }>;

  status: "alive" | "dormant";
  deathTick?: number;
  deathReason?: string;
};

export type Listing = {
  tokenId: string;
  sellerEngine: string;
  salePriceWei: bigint;
  active: boolean;
  worldId: string;
};
