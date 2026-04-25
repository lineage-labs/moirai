export type Receipt = {
  hash: string;
  verifiable: boolean;
  model?: string;
  createdAt: number;
  raw?: unknown;
};
