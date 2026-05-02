import { expect } from "chai";
import { ethers } from "hardhat";
import type { AgentNFT, AgentMarketplace } from "../typechain-types";

const WORLD_ID = ethers.encodeBytes32String("savannah");
const PRICE = ethers.parseEther("0.5");

describe("AgentMarketplace", () => {
  let nft: AgentNFT;
  let market: AgentMarketplace;
  let seller: ReturnType<typeof ethers.getSigner> extends Promise<infer T> ? T : never;
  let buyer: typeof seller;
  let stranger: typeof seller;

  beforeEach(async () => {
    [seller, buyer, stranger] = await ethers.getSigners() as [typeof seller, typeof seller, typeof seller];

    const NFTFactory = await ethers.getContractFactory("AgentNFT");
    nft = (await NFTFactory.deploy()) as unknown as AgentNFT;
    await nft.waitForDeployment();

    const MarketFactory = await ethers.getContractFactory("AgentMarketplace");
    market = (await MarketFactory.deploy(await nft.getAddress())) as unknown as AgentMarketplace;
    await market.waitForDeployment();

    // Mint token 0 to seller
    await nft.mint(seller.address, "root-hash-1");
  });

  describe("list", () => {
    it("creates an active listing with correct fields", async () => {
      await nft.connect(seller).approve(await market.getAddress(), 0);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      const listing = await market.listings(0);
      expect(listing.tokenId).to.equal(0n);
      expect(listing.sellerEngine).to.equal(seller.address);
      expect(listing.salePriceWei).to.equal(PRICE);
      expect(listing.active).to.be.true;
    });

    it("emits Listed event", async () => {
      await nft.connect(seller).approve(await market.getAddress(), 0);
      await expect(market.connect(seller).list(0, PRICE, WORLD_ID))
        .to.emit(market, "Listed")
        .withArgs(0n, seller.address, WORLD_ID, PRICE);
    });

    it("reverts if caller does not own the token", async () => {
      await expect(market.connect(stranger).list(0, PRICE, WORLD_ID))
        .to.be.revertedWith("not owner");
    });

    it("appears in getActiveListings", async () => {
      await nft.connect(seller).approve(await market.getAddress(), 0);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(1);
      expect(listings[0]!.tokenId).to.equal(0n);
    });
  });

  describe("delist", () => {
    beforeEach(async () => {
      await nft.connect(seller).approve(await market.getAddress(), 0);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
    });

    it("marks listing inactive", async () => {
      await market.connect(seller).delist(0);
      const listing = await market.listings(0);
      expect(listing.active).to.be.false;
    });

    it("emits Delisted", async () => {
      await expect(market.connect(seller).delist(0))
        .to.emit(market, "Delisted")
        .withArgs(0n);
    });

    it("reverts if caller is not the seller", async () => {
      await expect(market.connect(stranger).delist(0))
        .to.be.revertedWith("not seller");
    });

    it("does not appear in getActiveListings after delist", async () => {
      await market.connect(seller).delist(0);
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(0);
    });
  });

  describe("buy", () => {
    beforeEach(async () => {
      await nft.connect(seller).approve(await market.getAddress(), 0);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
    });

    it("transfers NFT ownership to buyer", async () => {
      await market.connect(buyer).buy(0, { value: PRICE });
      expect(await nft.ownerOf(0)).to.equal(buyer.address);
    });

    it("pays seller the listing price", async () => {
      const balBefore = await ethers.provider.getBalance(seller.address);
      await market.connect(buyer).buy(0, { value: PRICE });
      const balAfter = await ethers.provider.getBalance(seller.address);
      expect(balAfter - balBefore).to.equal(PRICE);
    });

    it("marks listing inactive after purchase", async () => {
      await market.connect(buyer).buy(0, { value: PRICE });
      const listing = await market.listings(0);
      expect(listing.active).to.be.false;
    });

    it("emits Sold event", async () => {
      await expect(market.connect(buyer).buy(0, { value: PRICE }))
        .to.emit(market, "Sold")
        .withArgs(0n, buyer.address);
    });

    it("reverts if listing is not active", async () => {
      await market.connect(seller).delist(0);
      await expect(market.connect(buyer).buy(0, { value: PRICE }))
        .to.be.revertedWith("not active");
    });

    it("reverts if payment is insufficient", async () => {
      await expect(market.connect(buyer).buy(0, { value: PRICE - 1n }))
        .to.be.revertedWith("insufficient payment");
    });

    it("cannot buy the same listing twice", async () => {
      await market.connect(buyer).buy(0, { value: PRICE });
      await expect(market.connect(stranger).buy(0, { value: PRICE }))
        .to.be.revertedWith("not active");
    });

    it("does not appear in getActiveListings after purchase", async () => {
      await market.connect(buyer).buy(0, { value: PRICE });
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(0);
    });
  });

  describe("getActiveListings", () => {
    it("returns multiple active listings across different agents", async () => {
      // Mint a second token
      await nft.mint(seller.address, "root-hash-2");

      await nft.connect(seller).approve(await market.getAddress(), 0);
      await nft.connect(seller).approve(await market.getAddress(), 1);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      await market.connect(seller).list(1, PRICE * 2n, WORLD_ID);

      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(2);
    });

    it("excludes sold and delisted tokens", async () => {
      await nft.mint(seller.address, "root-hash-2");
      await nft.connect(seller).approve(await market.getAddress(), 0);
      await nft.connect(seller).approve(await market.getAddress(), 1);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      await market.connect(seller).list(1, PRICE, WORLD_ID);

      await market.connect(buyer).buy(0, { value: PRICE }); // sold
      await market.connect(seller).delist(1);               // delisted

      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(0);
    });

    it("does not duplicate entry when same token is listed twice", async () => {
      await nft.connect(seller).setApprovalForAll(await market.getAddress(), true);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      // List same token again with a different price (re-list)
      await market.connect(seller).list(0, PRICE * 2n, WORLD_ID);
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(1);
      expect(listings[0]!.salePriceWei).to.equal(PRICE * 2n);
    });

    it("adds one entry when re-listing after delist", async () => {
      await nft.connect(seller).setApprovalForAll(await market.getAddress(), true);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      await market.connect(seller).delist(0);
      await market.connect(seller).list(0, PRICE * 3n, WORLD_ID);
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(1);
      expect(listings[0]!.salePriceWei).to.equal(PRICE * 3n);
    });
  });

  describe("setApprovalForAll", () => {
    it("allows listing without per-token approve", async () => {
      await nft.connect(seller).setApprovalForAll(await market.getAddress(), true);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(1);
    });

    it("allows listing multiple tokens without individual approvals", async () => {
      await nft.mint(seller.address, "root-hash-2");
      await nft.connect(seller).setApprovalForAll(await market.getAddress(), true);
      await market.connect(seller).list(0, PRICE, WORLD_ID);
      await market.connect(seller).list(1, PRICE * 2n, WORLD_ID);
      const listings = await market.getActiveListings();
      expect(listings.length).to.equal(2);
    });
  });
});
