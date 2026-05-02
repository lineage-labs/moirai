import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1. Deploy AgentNFT (comment out to redeploy marketplace only)
  // const NFTFactory = await ethers.getContractFactory("AgentNFT");
  // const nft = await NFTFactory.deploy();
  // await nft.waitForDeployment();
  // const nftAddress = await nft.getAddress();
  // console.log(`AgentNFT deployed:        ${nftAddress}`);
  const nftAddress = process.env.INFT_CONTRACT_ADDRESS!; // reuse existing

  // 2. Deploy AgentMarketplace (points to the NFT contract)
  const MarketFactory = await ethers.getContractFactory("AgentMarketplace");
  const market = await MarketFactory.deploy(nftAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`AgentMarketplace deployed: ${marketAddress}`);

  console.log(`\n--- Add to .env ---`);
  // console.log(`INFT_CONTRACT_ADDRESS=${nftAddress}`); // unchanged when redeploying marketplace only
  console.log(`MARKETPLACE_CONTRACT_ADDRESS=${marketAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
