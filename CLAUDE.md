# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VWBL is an on-chain, condition-based, decentralized access control protocol for NFTs. It enables the creation of NFTs where only rightful owners can access the associated encrypted digital content. The protocol provides blockchain users with decentralized encryption functionality for digital content.

## Development Commands

### Setup
```bash
yarn install
```

### Compilation
```bash
yarn compile
```

### Testing
```bash
# Run all tests
yarn test

# Run a specific test file
npx hardhat test test/vwbl_gateway.test.ts
```

### Linting and Formatting
```bash
# Lint Solidity contracts
yarn lint

# Format Solidity contracts
yarn format
```

### Contract Analysis
```bash
# Output contract sizes
yarn run hardhat size-contracts
```

### Local Development
```bash
# Start local Hardhat node
yarn local

# Fork Polygon mainnet
yarn fork-polygon
```

### Deployment

Deployments are network-specific and require configuration in `config/.env.${network_name}`:

```bash
# Deploy to specific networks
yarn deploy:polygon
yarn deploy:amoy          # Polygon testnet
yarn deploy:ethereum
yarn deploy:sepolia       # Ethereum testnet
yarn deploy:aurora
yarn deploy:aurora_testnet
yarn deploy:joc
yarn deploy:joc_testnet
yarn deploy:local         # Local Hardhat network
```

**Environment Configuration:** Each network requires a config file at `config/.env.${network_name}` with:
- `GATEWAY_PROXY_ADDRESS` - Address of the deployed GatewayProxy contract
- `ACCESS_CONTROL_CHECKER_BY_NFT_ADDRESS` - Address of the AccessControlChecker contract
- `METADATA_URL` - Base URL for NFT metadata (must end with `/metadata/`)
- `MESSAGE_TO_BE_SIGNED` - Message users sign to prove ownership
- `PRIVATE_KEY` - Deployer's private key
- Network-specific RPC URL (e.g., `POLYGON_URL`)

## Architecture

### Core Components

The protocol consists of three main layers:

**1. Gateway Layer** (`contracts/gateway/`)
- `VWBLGateway`: Central contract managing access control and fee collection. Maps document IDs to access condition contracts and tracks who has paid fees.
- `GatewayProxy`: Proxy contract allowing gateway upgrades without changing VWBL token contracts.
- `VWBLFetcher`: Helper contract for batch-fetching data from the gateway.

**2. Access Condition Layer** (`contracts/access-condition/`)
- `AbstractVWBLToken`: Base contract for VWBL NFTs, manages token info including documentId, minter address, and key retrieval URL.
- `AbstractVWBLSettings`: Manages gateway configuration, access checker contracts, sign messages, and CORS settings.
- `AbstractControlChecker`: Base for access condition verification contracts.

**3. Token Standards** (`contracts/access-condition/ERC*/`)
- **ERC721**: Standard NFT implementation with view permissions (VWBLERC721, VWBLERC721ERC2981)
- **ERC1155**: Multi-token standard for fungible/semi-fungible tokens (VWBLERC1155, VWBLERC1155ERC2981)
- **ERC6150**: Hierarchical NFT standard for parent-child token relationships (VWBLERC6150, VWBLERC6150ERC2981)

Each token type has two variants:
- Base version: Uses `baseURI` set at deployment for all tokens
- `ForMetadata` version: Stores individual metadata URIs per token (for IPFS)

### Access Control Flow

1. User mints VWBL NFT via token contract (e.g., `VWBLERC721.mint()`)
2. Token contract calls `AccessControlChecker.grantAccessControlAndRegisterNFT()`
3. Access checker registers the NFT and calls `VWBLGateway.grantAccessControl()`
4. Gateway stores mapping: `documentId → access condition contract address`
5. VWBL Network queries `VWBLGateway.hasAccessControl()` to verify access rights
6. Gateway checks: is user the owner, minter, or has paid fees AND passes access condition?

### Key Inheritance Chains

**VWBLERC721ERC2981:**
```
ERC721 → ERC721Enumerable → AbstractVWBLToken → AbstractVWBLSettings → VWBLERC721 → VWBLERC721ERC2981
```

**VWBLERC1155ERC2981:**
```
ERC1155 → AbstractVWBLToken → AbstractVWBLSettings → VWBLERC1155 → VWBLERC1155ERC2981
```

**VWBLERC6150ERC2981:**
```
ERC721 → ERC6150 → ERC6150ParentTransferable → AbstractVWBLToken → AbstractVWBLSettings → VWBLERC6150 → VWBLERC6150ERC2981
```

### View Permission System

VWBL NFTs implement a view permission mechanism allowing token owners to grant temporary access to non-owners:

- `grantViewPermission(tokenId, grantee)`: NFT owner grants view permission
- `revokeViewPermission(tokenId, revoker)`: NFT owner revokes view permission
- `checkViewPermission(tokenId, user)`: Verify if user has view permission

This is checked by `AccessControlCheckerByNFT` when determining access rights.

## Important Patterns

### Document ID
A `bytes32` identifier that links encrypted content to its access conditions. Same documentId is used across the NFT contract, access checker, and gateway.

### Fee System
- Gateway charges a fee (default 1 MATIC) for both minting and granting access
- Fees accumulate in `pendingFee` and can be withdrawn by gateway owner
- Users can pay fees for others via `payFee(documentId, user)`

### Access Checker Contracts
Access condition logic is separated into checker contracts (e.g., `AccessControlCheckerByNFT`). This allows different access models:
- NFT ownership-based access
- Token balance requirements
- Custom condition logic

### Network Configuration
The protocol is deployed across multiple networks (Ethereum, Polygon, Aurora, JOC). Each deployment maintains separate instances of gateway and checker contracts. Network configs are in `hardhat.config.ts` and `config/.env.*` files.

## Testing Notes

- Tests use Hardhat's local network with Waffle matchers
- Test files follow pattern: `vwbl_<feature>.test.ts`
- Common test pattern: deploy gateway → deploy proxy → deploy checker → deploy token contracts
- Fee is typically set to 1 ETH/MATIC (`utils.parseEther("1.0")`)
- Test document IDs are 32-byte hex strings starting with pattern like `0x7c00...`

## Deployment Script

The `scripts/deploy.ts` deploys `VWBLERC721ERC2981` by default. To deploy other contract types:
1. Modify the script to use desired contract factory (e.g., `VWBLERC1155ERC2981`, `VWBLERC721ERC2981ForMetadata`)
2. Adjust constructor parameters as needed
3. For `ForMetadata` variants, omit the `baseURI` parameter

The script reads configuration from environment variables loaded via `env-cmd` based on the target network.
