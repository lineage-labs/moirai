// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC721Transfer {
    function transferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/// @notice Listing registry and payment coordinator for moirai agent iNFTs.
/// Seller engine approves this contract then calls list(). Buyer engine calls buy() with payment.
contract AgentMarketplace {
    struct Listing {
        uint256 tokenId;
        address sellerEngine;
        uint256 salePriceWei;
        bool active;
        bytes32 worldId;
    }

    IERC721Transfer public immutable nftContract;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => bool) private _everListed;
    uint256[] private _listedTokenIds;

    event Listed(uint256 indexed tokenId, address indexed sellerEngine, bytes32 worldId, uint256 salePriceWei);
    event Sold(uint256 indexed tokenId, address indexed buyer);
    event Delisted(uint256 indexed tokenId);

    constructor(address _nftContract) {
        nftContract = IERC721Transfer(_nftContract);
    }

    function list(uint256 tokenId, uint256 salePriceWei, bytes32 worldId) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "not owner");
        if (!_everListed[tokenId]) {
            _listedTokenIds.push(tokenId);
            _everListed[tokenId] = true;
        }
        listings[tokenId] = Listing(tokenId, msg.sender, salePriceWei, true, worldId);
        emit Listed(tokenId, msg.sender, worldId, salePriceWei);
    }

    function delist(uint256 tokenId) external {
        require(listings[tokenId].sellerEngine == msg.sender, "not seller");
        listings[tokenId].active = false;
        emit Delisted(tokenId);
    }

    function buy(uint256 tokenId) external payable {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not active");
        require(msg.value >= listing.salePriceWei, "insufficient payment");
        listing.active = false;
        address seller = listing.sellerEngine;
        nftContract.transferFrom(seller, msg.sender, tokenId);
        payable(seller).transfer(msg.value);
        emit Sold(tokenId, msg.sender);
    }

    /// @notice Returns all active listings. Intended for off-chain read only.
    function getActiveListings() external view returns (Listing[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _listedTokenIds.length; i++) {
            if (listings[_listedTokenIds[i]].active) count++;
        }
        Listing[] memory result = new Listing[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _listedTokenIds.length; i++) {
            uint256 tid = _listedTokenIds[i];
            if (listings[tid].active) result[idx++] = listings[tid];
        }
        return result;
    }
}
