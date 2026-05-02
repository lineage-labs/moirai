import { expect } from "chai";
import { ethers } from "hardhat";
import type { AgentNFT } from "../typechain-types";

describe("AgentNFT", () => {
  let nft: AgentNFT;
  let owner: ReturnType<typeof ethers.getSigner> extends Promise<infer T> ? T : never;
  let other: typeof owner;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners() as [typeof owner, typeof owner];
    const Factory = await ethers.getContractFactory("AgentNFT");
    nft = (await Factory.deploy()) as unknown as AgentNFT;
    await nft.waitForDeployment();
  });

  describe("mint", () => {
    it("returns tokenId 0 for first mint", async () => {
      const tx = await nft.mint(owner.address, "0xabc");
      const receipt = await tx.wait();
      const log = receipt!.logs.find(l => {
        try { return nft.interface.parseLog(l)?.name === "Minted"; } catch { return false; }
      });
      const parsed = nft.interface.parseLog(log!);
      expect(parsed!.args[0]).to.equal(0n);
    });

    it("increments tokenId for each mint", async () => {
      await nft.mint(owner.address, "0xaaa");
      const tx = await nft.mint(owner.address, "0xbbb");
      const receipt = await tx.wait();
      const log = receipt!.logs.find(l => {
        try { return nft.interface.parseLog(l)?.name === "Minted"; } catch { return false; }
      });
      const parsed = nft.interface.parseLog(log!);
      expect(parsed!.args[0]).to.equal(1n);
    });

    it("sets the minter as owner", async () => {
      await nft.mint(other.address, "0xabc");
      expect(await nft.ownerOf(0)).to.equal(other.address);
    });

    it("stores the rootHash", async () => {
      await nft.mint(owner.address, "0xdeadbeef");
      expect(await nft.metadataRootHash(0)).to.equal("0xdeadbeef");
    });

    it("emits Minted with tokenId, to, rootHash", async () => {
      await expect(nft.mint(owner.address, "0xabc"))
        .to.emit(nft, "Minted")
        .withArgs(0n, owner.address, "0xabc");
    });
  });

  describe("setMetadataRootHash", () => {
    beforeEach(async () => {
      await nft.mint(owner.address, "initial");
    });

    it("updates the rootHash", async () => {
      await nft.setMetadataRootHash(0, "updated");
      expect(await nft.metadataRootHash(0)).to.equal("updated");
    });

    it("emits MetadataUpdated", async () => {
      await expect(nft.setMetadataRootHash(0, "updated"))
        .to.emit(nft, "MetadataUpdated")
        .withArgs(0n, "updated");
    });

    it("reverts when caller is not the token owner", async () => {
      await expect(nft.connect(other).setMetadataRootHash(0, "hack"))
        .to.be.revertedWith("not owner");
    });
  });

  describe("transfer", () => {
    it("transfers token to new owner via transferFrom", async () => {
      await nft.mint(owner.address, "0xabc");
      await nft.transferFrom(owner.address, other.address, 0);
      expect(await nft.ownerOf(0)).to.equal(other.address);
    });

    it("new owner can update metadata after transfer", async () => {
      await nft.mint(owner.address, "0xabc");
      await nft.transferFrom(owner.address, other.address, 0);
      await nft.connect(other).setMetadataRootHash(0, "new-root");
      expect(await nft.metadataRootHash(0)).to.equal("new-root");
    });

    it("old owner cannot update metadata after transfer", async () => {
      await nft.mint(owner.address, "0xabc");
      await nft.transferFrom(owner.address, other.address, 0);
      await expect(nft.setMetadataRootHash(0, "hack"))
        .to.be.revertedWith("not owner");
    });
  });
});
