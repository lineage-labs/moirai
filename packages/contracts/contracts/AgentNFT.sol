// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal ERC-721 where each token carries a 0G Storage rootHash as its metadata pointer.
contract AgentNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    // tokenId → 0G Storage rootHash (JSON metadata blob)
    mapping(uint256 => string) public metadataRootHash;

    event Minted(uint256 indexed tokenId, address indexed to, string rootHash);
    event MetadataUpdated(uint256 indexed tokenId, string rootHash);

    constructor() ERC721("MoiraiAgent", "AGENT") Ownable(msg.sender) {}

    /// @notice Mint a new agent token. Caller must be the current token owner (engine wallet).
    function mint(address to, string calldata rootHash) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        metadataRootHash[tokenId] = rootHash;
        emit Minted(tokenId, to, rootHash);
        return tokenId;
    }

    /// @notice Update metadata after a skill is learned or status changes.
    function setMetadataRootHash(uint256 tokenId, string calldata rootHash) external {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        metadataRootHash[tokenId] = rootHash;
        emit MetadataUpdated(tokenId, rootHash);
    }
}
