import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DEPLOYER_KEY = process.env["DEPLOYER_PRIVATE_KEY"];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { evmVersion: "cancun" },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    // 0G Galileo testnet
    galileo: {
      url: process.env["ZG_RPC_URL"] ?? "https://evmrpc-testnet.0g.ai",
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      chainId: 16602,
    },
    // Local Hardhat node for quick iteration
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
};

export default config;
