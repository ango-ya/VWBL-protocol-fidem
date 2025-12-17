// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// OpenZeppelin Upgradeable contracts
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// Regular utilities (no state, so non-upgradeable is fine)
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

// VWBL interfaces and base contracts
import "./IAccessControlCheckerByERC1155.sol";
import "../../gateway/IVWBLGateway.sol";
import "../../gateway/IGatewayProxy.sol";
import "../AbstractVWBLTokenUpgradeable.sol";

/**
 * @dev Upgradeable ERC1155 token for Fidem with:
 * - Revenue share configuration and tracking
 * - Comprehensive receipt system
 * - SBT-like transfer restrictions (one-time transfer with owner signature)
 * - Integration with VWBL gateway for access control
 */
contract VWBLFidemToken is
    AbstractVWBLTokenUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    ERC1155Upgradeable,
    ERC1155BurnableUpgradeable
{
    using SafeMath for uint256;
    using Strings for uint256;

    // ============ Constants ============

    uint256 public constant BASIS_POINTS_TOTAL = 10000; // 100% = 10000 basis points

    // ============ Structs ============

    struct RevenueShareConfig {
        address[] recipients;
        uint256[] shares; // Basis points (5000 = 50%)
        uint256 totalShares; // Must equal BASIS_POINTS_TOTAL
        bool isConfigured;
    }

    struct MintReceipt {
        uint256 receiptId;
        uint256 tokenId;
        address customer;
        uint256 saleAmount;
        uint256 timestamp;
        string fidemInvoiceId;
        string paymentInvoiceId;
        address[] recipients; // Revenue share recipients at time of purchase
        uint256[] shares; // Revenue share percentages at time of purchase (basis points)
    }

    struct TransferStatus {
        bool hasTransferred;
        address transferredTo;
        uint256 transferTimestamp;
    }

    // ============ VWBLFidemToken Specific Storage ============

    mapping(uint256 => address) public tokenOwners;
    mapping(uint256 => RevenueShareConfig) public tokenIdToRevenueShare;
    uint256 public receiptCounter;
    mapping(uint256 => MintReceipt) public receipts;
    mapping(uint256 => uint256[]) public tokenIdToReceipts;
    mapping(address => uint256[]) public customerToReceipts;
    mapping(uint256 => mapping(address => TransferStatus)) public transferStatus;

    // Flag for allowing transfers from safeTransferByOwner
    bool private _executingOwnerTransfer;

    // ============ Storage Gap ============

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * We have 8 VWBLFidemToken-specific variables, so reserve 42 slots to make 50 total.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[42] private __gap;

    // ============ Events ============

    event TokenCreated(
        uint256 indexed tokenId,
        address indexed tokenOwner,
        bytes32 documentId,
        address[] recipients,
        uint256[] shares
    );

    event TokenMinted(
        uint256 indexed receiptId,
        uint256 indexed tokenId,
        address indexed customer,
        uint256 saleAmount,
        string fidemInvoiceId,
        string paymentInvoiceId
    );

    event RevenueShareUpdated(uint256 indexed tokenId, address[] recipients, uint256[] shares);

    event TransferByOwner(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        uint256 amount
    );

    event ReceiptCreated(uint256 indexed receiptId, uint256 indexed tokenId, address indexed customer);

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _baseURI,
        address _gatewayProxy,
        address _accessCheckerContract,
        string memory _signMessage
    ) public initializer {
        // Call parent initializers in linearized order
        __AbstractVWBLToken_init(_baseURI, _gatewayProxy, _accessCheckerContract, _signMessage);
        __ReentrancyGuard_init();
        __ERC1155_init(_baseURI);
        __ERC1155Burnable_init();
        __UUPSUpgradeable_init();

        // Initialize VWBLFidemToken-specific state
        receiptCounter = 0;
        _executingOwnerTransfer = false;
    }

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Required Overrides ============

    function uri(uint256 tokenId) public view override returns (string memory) {
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString())) : "";
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ============ create() Function ============

    /**
     * @notice Create a new token with revenue share configuration
     * @param _getKeyUrl The URL of VWBL Network (Key management network)
     * @param _documentId The Identifier of digital content and decryption key
     * @param _recipients Array of revenue share recipient addresses
     * @param _shares Array of revenue shares in basis points (10000 = 100%)
     */
    function create(
        string memory _getKeyUrl,
        bytes32 _documentId,
        address[] memory _recipients,
        uint256[] memory _shares
    ) public payable returns (uint256) {
        // Validate inputs
        require(_recipients.length == _shares.length, "Array length mismatch");
        require(_recipients.length > 0, "Empty recipients");

        // Validate shares sum to BASIS_POINTS_TOTAL
        uint256 totalShares = 0;
        for (uint256 i = 0; i < _shares.length; i++) {
            require(_recipients[i] != address(0), "Zero address recipient");
            totalShares += _shares[i];
        }
        require(totalShares == BASIS_POINTS_TOTAL, "Shares must equal BASIS_POINTS_TOTAL");

        // Generate token ID
        uint256 tokenId = ++counter;

        // Store TokenInfo
        tokenIdToTokenInfo[tokenId] = TokenInfo(_documentId, msg.sender, _getKeyUrl);

        // Store Token Owner
        tokenOwners[tokenId] = msg.sender;

        // Store Revenue Share Config
        tokenIdToRevenueShare[tokenId] = RevenueShareConfig({
            recipients: _recipients,
            shares: _shares,
            totalShares: totalShares,
            isConfigured: true
        });

        // Integrate with VWBL gateway
        IAccessControlCheckerByERC1155(accessCheckerContract).grantAccessControlAndRegisterERC1155{
            value: msg.value
        }(_documentId, address(this), tokenId);

        emit TokenCreated(tokenId, msg.sender, _documentId, _recipients, _shares);

        return tokenId;
    }

    // ============ mint() Function ============

    /**
     * @notice Mint additional tokens to customer (only Token Owner)
     * @param tokenId The token ID to mint
     * @param customer The customer address
     * @param saleAmount The sale amount for revenue calculation
     * @param fidemInvoiceId Fidem's invoice ID (string)
     * @param paymentInvoiceId Payment platform's invoice ID (string)
     */
    function mint(
        uint256 tokenId,
        address customer,
        uint256 saleAmount,
        string memory fidemInvoiceId,
        string memory paymentInvoiceId
    ) public payable returns (uint256) {
        // Input validation
        require(customer != address(0), "Invalid customer address");
        require(tokenOwners[tokenId] == msg.sender, "Only Token Owner can mint");
        require(tokenIdToTokenInfo[tokenId].minterAddress != address(0), "Token does not exist");

        // Fee validation
        uint256 vwblFee = getFee();
        require(msg.value >= vwblFee, "Insufficient VWBL fee");

        // Get current revenue share configuration
        RevenueShareConfig memory config = tokenIdToRevenueShare[tokenId];
        require(config.isConfigured, "Revenue share not configured");

        // Create receipt with immutable snapshot of share configuration at purchase time
        uint256 receiptId = ++receiptCounter;
        receipts[receiptId] = MintReceipt({
            receiptId: receiptId,
            tokenId: tokenId,
            customer: customer,
            saleAmount: saleAmount,
            timestamp: block.timestamp,
            fidemInvoiceId: fidemInvoiceId,
            paymentInvoiceId: paymentInvoiceId,
            recipients: config.recipients,
            shares: config.shares
        });

        // Store receipt IDs
        tokenIdToReceipts[tokenId].push(receiptId);
        customerToReceipts[customer].push(receiptId);

        // Pay VWBL fee to gateway (only the required fee amount)
        IVWBLGateway(getGatewayAddress()).payFee{value: vwblFee}(
            tokenIdToTokenInfo[tokenId].documentId,
            customer
        );

        // Refund excess ETH if any
        if (msg.value > vwblFee) {
            uint256 refund = msg.value - vwblFee;
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Refund failed");
        }

        // Mint token to customer
        _mint(customer, tokenId, 1, "");

        emit TokenMinted(receiptId, tokenId, customer, saleAmount, fidemInvoiceId, paymentInvoiceId);
        emit ReceiptCreated(receiptId, tokenId, customer);

        return receiptId;
    }

    // ============ Revenue Share Management ============

    /**
     * @notice Update revenue share configuration (Token Owner only)
     */
    function updateRevenueShare(
        uint256 tokenId,
        address[] memory _recipients,
        uint256[] memory _shares
    ) public {
        require(tokenOwners[tokenId] == msg.sender, "Only Token Owner can update");
        _updateRevenueShareConfig(tokenId, _recipients, _shares);
    }

    /**
     * @notice Update revenue share configuration (Contract Owner only)
     */
    function updateRevenueShareByAdmin(
        uint256 tokenId,
        address[] memory _recipients,
        uint256[] memory _shares
    ) public onlyOwner {
        _updateRevenueShareConfig(tokenId, _recipients, _shares);
    }

    /**
     * @notice Internal function to update revenue share configuration
     */
    function _updateRevenueShareConfig(
        uint256 tokenId,
        address[] memory _recipients,
        uint256[] memory _shares
    ) private {
        require(_recipients.length == _shares.length, "Length mismatch");
        require(_recipients.length > 0, "Empty recipients");

        uint256 totalShares = 0;
        for (uint256 i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
            require(_recipients[i] != address(0), "Zero address");
        }
        require(totalShares == BASIS_POINTS_TOTAL, "Shares must equal BASIS_POINTS_TOTAL");

        tokenIdToRevenueShare[tokenId] = RevenueShareConfig({
            recipients: _recipients,
            shares: _shares,
            totalShares: totalShares,
            isConfigured: true
        });

        emit RevenueShareUpdated(tokenId, _recipients, _shares);
    }

    /**
     * @notice Get revenue share configuration
     */
    function getRevenueShareConfig(uint256 tokenId)
        public
        view
        returns (address[] memory, uint256[] memory)
    {
        RevenueShareConfig memory config = tokenIdToRevenueShare[tokenId];
        return (config.recipients, config.shares);
    }

    // ============ Transfer Restrictions (SBT-like) ============

    /**
     * @notice Transfer token with contract owner authorization (one-time only)
     * @dev Only contract owner can call this function
     * @param from Source address
     * @param to Destination address
     * @param id Token ID
     * @param amount Amount to transfer
     */
    function safeTransferByOwner(
        address from,
        address to,
        uint256 id,
        uint256 amount
    ) public onlyOwner nonReentrant {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");

        // Check if FROM address has already received via owner transfer
        require(!transferStatus[id][from].hasTransferred, "Already transferred");

        // Mark TO address as having received via owner transfer (prevents recipient from transferring again)
        transferStatus[id][to] = TransferStatus({
            hasTransferred: true,
            transferredTo: to,
            transferTimestamp: block.timestamp
        });

        // Set flag to allow transfer
        _executingOwnerTransfer = true;

        // Perform transfer using internal function to bypass approval check
        _safeTransferFrom(from, to, id, amount, "");

        // Reset flag
        _executingOwnerTransfer = false;

        emit TransferByOwner(from, to, id, amount);
    }

    // ============ Transfer Restrictions ============

    /**
     * @dev Hook that is called before any token transfer. This includes minting and burning.
     *
     * Restrictions:
     * - Normal transfers are blocked (will revert)
     * - Only minting, burning, and owner-authorized transfers are allowed
     *
     * @notice Users cannot directly call safeTransferFrom or safeBatchTransferFrom
     * @notice Use safeTransferByOwner for owner-authorized one-time transfers
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155Upgradeable) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        // Allow minting
        if (from == address(0)) {
            return;
        }

        // Allow burning
        if (to == address(0)) {
            return;
        }

        // Allow if called from safeTransferByOwner
        if (_executingOwnerTransfer) {
            return;
        }

        // Otherwise, block transfer
        revert("Transfers restricted - use safeTransferByOwner");
    }

    // ============ Receipt Query Functions ============

    /**
     * @notice Get receipt by ID
     */
    function getReceipt(uint256 receiptId) public view returns (MintReceipt memory) {
        return receipts[receiptId];
    }

    /**
     * @notice Get all receipt IDs for a token
     */
    function getReceiptsByToken(uint256 tokenId) public view returns (uint256[] memory) {
        return tokenIdToReceipts[tokenId];
    }

    /**
     * @notice Get all receipt IDs for a customer
     */
    function getReceiptsByCustomer(address customer) public view returns (uint256[] memory) {
        return customerToReceipts[customer];
    }

    /**
     * @notice Get receipt count for a token
     */
    function getReceiptCountByToken(uint256 tokenId) public view returns (uint256) {
        return tokenIdToReceipts[tokenId].length;
    }

    /**
     * @notice Get receipt count for a customer
     */
    function getReceiptCountByCustomer(address customer) public view returns (uint256) {
        return customerToReceipts[customer].length;
    }

    /**
     * @notice Get receipts for a token with pagination
     */
    function getReceiptsByTokenPaginated(
        uint256 tokenId,
        uint256 offset,
        uint256 limit
    ) public view returns (MintReceipt[] memory) {
        uint256[] memory receiptIds = tokenIdToReceipts[tokenId];

        // Return empty array if no receipts exist
        if (receiptIds.length == 0) {
            return new MintReceipt[](0);
        }

        require(offset < receiptIds.length, "Offset out of bounds");

        uint256 end = offset + limit > receiptIds.length ? receiptIds.length : offset + limit;

        MintReceipt[] memory result = new MintReceipt[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = receipts[receiptIds[i]];
        }
        return result;
    }
}
