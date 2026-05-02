import { ethers } from "ethers";
import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentNFTMetadata } from "./types.js";

const AGENT_NFT_ABI = [
  "function mint(address to, string calldata rootHash) external returns (uint256)",
  "function setMetadataRootHash(uint256 tokenId, string calldata rootHash) external",
  "function setTokenURI(uint256 tokenId, string calldata uri) external",
  "function metadataRootHash(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function approve(address to, uint256 tokenId) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "event Minted(uint256 indexed tokenId, address indexed to, string rootHash)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

export type INFTAdapterConfig = {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  indexerUrl: string;
};

export class INFTAdapter {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly contract: ethers.Contract;
  private readonly indexer: Indexer;
  private readonly cfg: INFTAdapterConfig;
  // Serialize all chain writes to avoid nonce conflicts when multiple agents act concurrently
  private _writeQueue: Promise<unknown> = Promise.resolve();

  constructor(cfg: INFTAdapterConfig) {
    this.cfg = cfg;
    this.provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
    this.wallet = new ethers.Wallet(cfg.privateKey, this.provider);
    this.contract = new ethers.Contract(cfg.contractAddress, AGENT_NFT_ABI, this.wallet);
    this.indexer = new Indexer(cfg.indexerUrl);
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this._writeQueue.then(fn);
    this._writeQueue = next.catch(() => {});
    return next;
  }

  get walletAddress(): string {
    return this.wallet.address;
  }

  get contractInstance(): ethers.Contract {
    return this.contract;
  }

  async mint(agentId: string, metadata: AgentNFTMetadata): Promise<string> {
    return this.enqueue(async () => {
      const rootHash = await this.storeMetadata(metadata);
      const tx = await this.contract.getFunction("mint")(this.wallet.address, rootHash) as ethers.ContractTransactionResponse;
      const receipt = await tx.wait();
      if (!receipt) throw new Error(`[INFTAdapter] mint tx failed for ${agentId}`);
      const iface = new ethers.Interface(AGENT_NFT_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "Minted") {
            const tokenId = parsed.args[0] as bigint;
            console.error(`[INFTAdapter] minted tokenId=${tokenId} agent=${agentId} rootHash=${rootHash}`);
            return tokenId.toString();
          }
        } catch { /* skip unparseable logs */ }
      }
      throw new Error(`[INFTAdapter] Minted event not found in receipt for ${agentId}`);
    });
  }

  async updateMetadata(tokenId: string, metadata: AgentNFTMetadata): Promise<void> {
    return this.enqueue(async () => {
      const rootHash = await this.storeMetadata(metadata);
      const tx = await this.contract.getFunction("setMetadataRootHash")(BigInt(tokenId), rootHash) as ethers.ContractTransactionResponse;
      await tx.wait();
      console.error(`[INFTAdapter] updateMetadata tokenId=${tokenId} rootHash=${rootHash}`);
    });
  }

  async setDormant(tokenId: string, metadata: AgentNFTMetadata): Promise<void> {
    return this.enqueue(async () => {
      const rootHash = await this.storeMetadata({ ...metadata, status: "dormant" });
      const tx = await this.contract.getFunction("setMetadataRootHash")(BigInt(tokenId), rootHash) as ethers.ContractTransactionResponse;
      await tx.wait();
      console.error(`[INFTAdapter] setDormant tokenId=${tokenId} rootHash=${rootHash}`);
    });
  }

  async transfer(tokenId: string, toAddress: string): Promise<string> {
    return this.enqueue(async () => {
      const tx = await this.contract.getFunction("transferFrom")(this.wallet.address, toAddress, BigInt(tokenId)) as ethers.ContractTransactionResponse;
      const receipt = await tx.wait();
      if (!receipt) throw new Error(`[INFTAdapter] transfer failed tokenId=${tokenId}`);
      console.error(`[INFTAdapter] transferred tokenId=${tokenId} to=${toAddress}`);
      return receipt.hash;
    });
  }

  async approveMarketplace(tokenId: string, marketplaceAddress: string): Promise<void> {
    return this.enqueue(() => this._approve(tokenId, marketplaceAddress));
  }

  async approveMarketplaceForAll(marketplaceAddress: string): Promise<void> {
    const already = await this.contract.getFunction("isApprovedForAll")(this.wallet.address, marketplaceAddress) as boolean;
    if (already) return;
    return this.enqueue(async () => {
      const tx = await this.contract.getFunction("setApprovalForAll")(marketplaceAddress, true) as ethers.ContractTransactionResponse;
      await tx.wait();
      console.error(`[INFTAdapter] setApprovalForAll marketplace=${marketplaceAddress}`);
    });
  }

  // Run approve + an arbitrary follow-up write as one atomic queue entry (prevents nonce conflicts)
  async approveAndRun(tokenId: string, marketplaceAddress: string, followUp: () => Promise<void>): Promise<void> {
    return this.enqueue(async () => {
      await this._approve(tokenId, marketplaceAddress);
      await followUp();
    });
  }

  private async _approve(tokenId: string, marketplaceAddress: string): Promise<void> {
    const tx = await this.contract.getFunction("approve")(marketplaceAddress, BigInt(tokenId)) as ethers.ContractTransactionResponse;
    await tx.wait();
  }

  async readMetadata(tokenId: string): Promise<AgentNFTMetadata> {
    const rootHash = await this.contract.getFunction("metadataRootHash")(BigInt(tokenId)) as string;
    if (!rootHash) throw new Error(`[INFTAdapter] no rootHash for tokenId=${tokenId}`);
    return this.downloadMetadata(rootHash);
  }

  async getOwnedTokenIds(): Promise<string[]> {
    const addr = await this.contract.getAddress();
    const iface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]);
    const transferSig = iface.getEvent("Transfer")!.topicHash;
    const walletTopic = ethers.zeroPadValue(this.wallet.address, 32);

    const [incoming, outgoing] = await Promise.all([
      this.provider.getLogs({ address: addr, topics: [transferSig, null, walletTopic], fromBlock: 0, toBlock: "latest" }),
      this.provider.getLogs({ address: addr, topics: [transferSig, walletTopic, null], fromBlock: 0, toBlock: "latest" }),
    ]);

    const parseId = (log: ethers.Log) => (iface.parseLog(log)!.args[2] as bigint).toString();
    const sentSet = new Set(outgoing.map(parseId));
    return incoming.map(parseId).filter(id => !sentSet.has(id));
  }

  async setTokenURI(tokenId: string, uri: string): Promise<void> {
    return this.enqueue(async () => {
      const tx = await this.contract.getFunction("setTokenURI")(BigInt(tokenId), uri) as ethers.ContractTransactionResponse;
      await tx.wait();
    });
  }

  private async storeMetadata(metadata: AgentNFTMetadata): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(metadata));
    // Retry on REPLACEMENT_UNDERPRICED — the 0G Storage SDK fetches the nonce from the node
    // before submitting the storage-fee tx. If a previous tx from the same wallet hasn't fully
    // propagated yet, the SDK picks the same nonce and gets rejected. A short wait lets the node
    // catch up so the retry sees the correct next nonce.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));
      const data = new MemData(bytes);
      const [result, err] = await this.indexer.upload(data, this.cfg.rpcUrl, this.wallet as never);
      if (!err) {
        if (!result || !("rootHash" in result) || !result.rootHash) {
          throw new Error("[INFTAdapter] 0G Storage upload returned no rootHash");
        }
        return result.rootHash as string;
      }
      const msg = String(err);
      if (msg.includes("REPLACEMENT_UNDERPRICED") || msg.includes("replacement fee too low")) {
        console.warn(`[INFTAdapter] storeMetadata attempt ${attempt + 1} REPLACEMENT_UNDERPRICED — retrying…`);
        lastErr = err;
        continue;
      }
      throw err;
    }
    throw lastErr;
  }

  private async downloadMetadata(rootHash: string): Promise<AgentNFTMetadata> {
    const dir = await mkdtemp(join(tmpdir(), "moirai-meta-"));
    const filePath = join(dir, "meta.json");
    try {
      const err = await this.indexer.download(rootHash, filePath, true);
      if (err) throw err;
      const text = await readFile(filePath, "utf8");
      return JSON.parse(text) as AgentNFTMetadata;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
