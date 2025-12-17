// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./IVWBL.sol";
import "../gateway/IGatewayProxy.sol";
import "../gateway/IVWBLGateway.sol";

abstract contract AbstractVWBLSettingsUpgradeable is Initializable, IVWBL, OwnableUpgradeable {
    address public gatewayProxy;
    string private signMessage;
    string private allowOrigins;
    address public accessCheckerContract;

    event accessCheckerContractChanged(address oldAccessCheckerContract, address newAccessCheckerContract);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __AbstractVWBLSettings_init(
        address _gatewayProxy,
        address _accessCheckerContract,
        string memory _signMessage
    ) internal onlyInitializing {
        __Ownable_init();
        __AbstractVWBLSettings_init_unchained(_gatewayProxy, _accessCheckerContract, _signMessage);
    }

    function __AbstractVWBLSettings_init_unchained(
        address _gatewayProxy,
        address _accessCheckerContract,
        string memory _signMessage
    ) internal onlyInitializing {
        gatewayProxy = _gatewayProxy;
        signMessage = _signMessage;
        accessCheckerContract = _accessCheckerContract;
    }

    function getGatewayAddress() public view returns (address) {
        return IGatewayProxy(gatewayProxy).getGatewayAddress();
    }

    /**
     * @notice Get VWBL Fee
     */
    function getFee() public view returns (uint256) {
        return IVWBLGateway(getGatewayAddress()).feeWei();
    }

    /**
     * @notice Get the message to be signed of this contract
     */
    function getSignMessage() public view returns (string memory) {
        return signMessage;
    }

    /**
     * @notice Set the message to be signed of this contract
     */
    function setSignMessage(string calldata _signMessage) public onlyOwner {
        signMessage = _signMessage;
    }

    function getAllowOrigins() public view returns (string memory) {
        return allowOrigins;
    }

    function setAllowOrigins(string memory _origins) public onlyOwner {
        allowOrigins = _origins;
    }

    /**
     * @notice Set new access condition contract address
     * @param newAccessCheckerContract The contract address of new access condition contract
     */
    function setAccessCheckerContract(address newAccessCheckerContract) public onlyOwner {
        require(newAccessCheckerContract != accessCheckerContract);
        address oldAccessCheckerContract = accessCheckerContract;
        accessCheckerContract = newAccessCheckerContract;

        emit accessCheckerContractChanged(oldAccessCheckerContract, newAccessCheckerContract);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[46] private __gap;
}
