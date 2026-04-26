export type Receipt = {
  hash: string;
  verifiable: boolean;
  model?: string;
  createdAt: number;
  providerAddress?: string;
  usageData?: string;
  raw?: unknown;
};
