// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal ERC-721 where each token carries a 0G Storage rootHash as its metadata pointer.
/// tokenURI() returns a pre-built data:application/json;base64 URI set by the engine so explorers
/// like 0G Chainscan can read name and image directly from the contract.
contract AgentNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    // tokenId → 0G Storage rootHash (full metadata blob for SDK consumers)
    mapping(uint256 => string) public metadataRootHash;

    // tokenId → fully-formed data URI returned by tokenURI() (for explorers)
    mapping(uint256 => string) private _tokenURIs;

    event Minted(uint256 indexed tokenId, address indexed to, string rootHash);
    event MetadataUpdated(uint256 indexed tokenId, string rootHash);

    constructor() ERC721("MoiraiAgent", "AGENT") Ownable(msg.sender) {}

    /// @notice Returns the on-chain metadata URI for a token.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    /// @notice Update the on-chain tokenURI (name + image embedded as data URI). Owner only.
    function setTokenURI(uint256 tokenId, string calldata uri) external {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        _tokenURIs[tokenId] = uri;
    }

    /// @notice Mint a new agent token.
    function mint(address to, string calldata rootHash) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        metadataRootHash[tokenId] = rootHash;
        emit Minted(tokenId, to, rootHash);
        return tokenId;
    }

    /// @notice Update the 0G Storage rootHash after metadata changes.
    function setMetadataRootHash(uint256 tokenId, string calldata rootHash) external {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        metadataRootHash[tokenId] = rootHash;
        emit MetadataUpdated(tokenId, rootHash);
    }
}
