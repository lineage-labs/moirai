import { ethers } from "ethers";
import type { Listing } from "./types.js";

const MARKETPLACE_ABI = [
  "function list(uint256 tokenId, uint256 salePriceWei, bytes32 worldId) external",
  "function delist(uint256 tokenId) external",
  "function buy(uint256 tokenId) external payable",
  "function getActiveListings() external view returns (tuple(uint256 tokenId, address sellerEngine, uint256 salePriceWei, bool active, bytes32 worldId)[])",
  "function listings(uint256) external view returns (uint256 tokenId, address sellerEngine, uint256 salePriceWei, bool active, bytes32 worldId)",
  "event Listed(uint256 indexed tokenId, address indexed sellerEngine, bytes32 worldId, uint256 salePriceWei)",
  "event Sold(uint256 indexed tokenId, address indexed buyer)",
  "event Delisted(uint256 indexed tokenId)",
];

export type MarketplaceAdapterConfig = {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
};

export class MarketplaceAdapter {
  private readonly wallet: ethers.Wallet;
  private readonly contract: ethers.Contract;

  constructor(cfg: MarketplaceAdapterConfig) {
    const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
    this.wallet = new ethers.Wallet(cfg.privateKey, provider);
    this.contract = new ethers.Contract(cfg.contractAddress, MARKETPLACE_ABI, this.wallet);
  }

  get contractInstance(): ethers.Contract {
    return this.contract;
  }

  async list(tokenId: string, salePriceWei: bigint, worldId: string): Promise<void> {
    const worldIdBytes = ethers.encodeBytes32String(worldId.slice(0, 31));
    const tx = await this.contract.getFunction("list")(BigInt(tokenId), salePriceWei, worldIdBytes) as ethers.ContractTransactionResponse;
    await tx.wait();
    console.error(`[MarketplaceAdapter] listed tokenId=${tokenId} price=${salePriceWei}`);
  }

  async delist(tokenId: string): Promise<void> {
    const tx = await this.contract.getFunction("delist")(BigInt(tokenId)) as ethers.ContractTransactionResponse;
    await tx.wait();
    console.error(`[MarketplaceAdapter] delisted tokenId=${tokenId}`);
  }

  async buy(tokenId: string, valueWei: bigint): Promise<string> {
    const tx = await this.contract.getFunction("buy")(BigInt(tokenId), { value: valueWei }) as ethers.ContractTransactionResponse;
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`[MarketplaceAdapter] buy failed tokenId=${tokenId}`);
    console.error(`[MarketplaceAdapter] bought tokenId=${tokenId}`);
    return receipt.hash;
  }

  async getActiveListings(): Promise<Listing[]> {
    const raw = await this.contract.getFunction("getActiveListings")() as Array<[bigint, string, bigint, boolean, string]>;
    return raw.map((r) => ({
      tokenId: r[0].toString(),
      sellerEngine: r[1],
      salePriceWei: r[2],
      active: r[3],
      worldId: ethers.decodeBytes32String(r[4]),
    }));
  }
}
