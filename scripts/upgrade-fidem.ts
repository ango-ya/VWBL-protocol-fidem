import { ethers, upgrades } from "hardhat"
import * as dotenv from "dotenv"
dotenv.config()

async function main() {
    const proxyAddress = process.env.PROXY_ADDRESS

    if (!proxyAddress) {
        console.error("Error: PROXY_ADDRESS environment variable is not set")
        console.error("Please set PROXY_ADDRESS to the deployed proxy contract address")
        console.error("Example: PROXY_ADDRESS=0x1234... npx hardhat run scripts/upgrade-fidem.ts")
        process.exit(1)
    }

    console.log("Upgrading VWBLFidemToken at proxy address:", proxyAddress)

    // Get the new contract factory (V2)
    const VWBLFidemTokenV2 = await ethers.getContractFactory("VWBLFidemTokenV2")

    console.log("Upgrading proxy...")
    const upgraded = await upgrades.upgradeProxy(proxyAddress, VWBLFidemTokenV2)

    console.log("VWBLFidemToken upgraded successfully")
    console.log("Proxy address (unchanged):", upgraded.address)

    // Get new implementation address
    const newImplAddress = await upgrades.erc1967.getImplementationAddress(upgraded.address)
    console.log("New implementation deployed to:", newImplAddress)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
