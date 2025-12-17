// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./AbstractVWBLSettingsUpgradeable.sol";

abstract contract AbstractVWBLTokenUpgradeable is AbstractVWBLSettingsUpgradeable {
    string public baseURI;
    uint256 public counter;

    struct TokenInfo {
        bytes32 documentId;
        address minterAddress;
        string getKeyURl;
    }

    mapping(uint256 => TokenInfo) public tokenIdToTokenInfo;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __AbstractVWBLToken_init(
        string memory _baseURI,
        address _gatewayProxy,
        address _accessCheckerContract,
        string memory _signMessage
    ) internal onlyInitializing {
        __AbstractVWBLSettings_init(_gatewayProxy, _accessCheckerContract, _signMessage);
        __AbstractVWBLToken_init_unchained(_baseURI);
    }

    function __AbstractVWBLToken_init_unchained(string memory _baseURI) internal onlyInitializing {
        baseURI = _baseURI;
        counter = 0;
    }

    /**
     * @notice Set BaseURI.
     * @param _baseURI new BaseURI
     */
    function setBaseURI(string memory _baseURI) public onlyOwner {
        baseURI = _baseURI;
    }

    /**
     * @notice Get minter of NFT by tokenId
     * @param tokenId The Identifier of NFT
     */
    function getMinter(uint256 tokenId) public view returns (address) {
        return tokenIdToTokenInfo[tokenId].minterAddress;
    }

    /**
     * @notice Get token Info for each minter
     * @param minter The address of NFT Minter
     */
    function getTokenByMinter(address minter) public view returns (uint256[] memory) {
        uint256 resultCount = 0;
        for (uint256 i = 1; i <= counter; i++) {
            if (tokenIdToTokenInfo[i].minterAddress == minter) {
                resultCount++;
            }
        }
        uint256[] memory tokens = new uint256[](resultCount);
        uint256 currentCounter = 0;
        for (uint256 i = 1; i <= counter; i++) {
            if (tokenIdToTokenInfo[i].minterAddress == minter) {
                tokens[currentCounter++] = i;
            }
        }
        return tokens;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[47] private __gap;
}
