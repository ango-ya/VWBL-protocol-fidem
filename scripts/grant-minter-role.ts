// Grant MINTER_ROLE on a deployed VWBLFidemToken proxy to a given account.
//
// The account holding DEFAULT_ADMIN_ROLE (the deployer configured via PRIVATE_KEY
// in config/.env.${network}) signs the grantRole transaction.
//
// Usage:
//   PROXY_ADDRESS=0x... MINTER_ADDRESS=0x... \
//     env-cmd -f ./config/.env.optimism hardhat run --network optimism scripts/grant-minter-role.ts
//
// Or via the package.json shortcut (reads config/.env.optimism):
//   PROXY_ADDRESS=0x... MINTER_ADDRESS=0x... yarn grant-minter:optimism
import { ethers } from "hardhat"
import * as dotenv from "dotenv"
dotenv.config()

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        console.error(`Error: ${name} environment variable is not set`)
        console.error(`Please set ${name} (e.g. PROXY_ADDRESS=0x... MINTER_ADDRESS=0x...)`)
        process.exit(1)
    }
    return value
}

function requireAddress(name: string): string {
    const value = requireEnv(name)
    if (!ethers.isAddress(value)) {
        console.error(`Error: ${name} is not a valid address: ${value}`)
        process.exit(1)
    }
    return ethers.getAddress(value)
}

async function main() {
    const proxyAddress = requireAddress("PROXY_ADDRESS")
    const minterAddress = requireAddress("MINTER_ADDRESS")

    const [signer] = await ethers.getSigners()
    const network = await ethers.provider.getNetwork()
    console.log("Network:", network.name, `(chainId=${network.chainId})`)
    console.log("Signer:", signer.address)
    console.log("VWBLFidemToken proxy:", proxyAddress)
    console.log("Account to grant MINTER_ROLE:", minterAddress)

    const token = await ethers.getContractAt("VWBLFidemToken", proxyAddress, signer)

    const MINTER_ROLE = await token.MINTER_ROLE()
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE()

    // The signer must hold DEFAULT_ADMIN_ROLE to grant MINTER_ROLE.
    const signerIsAdmin = await token.hasRole(DEFAULT_ADMIN_ROLE, signer.address)
    if (!signerIsAdmin) {
        console.error(`Error: signer ${signer.address} does not hold DEFAULT_ADMIN_ROLE on ${proxyAddress}`)
        console.error("Use the deployer / admin account (config/.env.* PRIVATE_KEY) to run this script")
        process.exit(1)
    }

    // Idempotent: skip if the account already has MINTER_ROLE.
    if (await token.hasRole(MINTER_ROLE, minterAddress)) {
        console.log(`\n✅ ${minterAddress} already has MINTER_ROLE. Nothing to do.`)
        return
    }

    console.log("\nGranting MINTER_ROLE...")
    const tx = await token.grantRole(MINTER_ROLE, minterAddress)
    console.log("Transaction sent:", tx.hash)
    const receipt = await tx.wait()
    console.log("Confirmed in block:", receipt?.blockNumber)

    const granted = await token.hasRole(MINTER_ROLE, minterAddress)
    if (!granted) {
        console.error("Error: grantRole transaction mined but MINTER_ROLE is still not set")
        process.exit(1)
    }

    console.log(`\n✅ MINTER_ROLE granted to ${minterAddress}`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
