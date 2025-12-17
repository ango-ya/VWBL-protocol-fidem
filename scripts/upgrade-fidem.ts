import { ethers, upgrades } from "hardhat"
import * as dotenv from "dotenv"
dotenv.config()

async function main() {
    const proxyAddress = process.env.PROXY_ADDRESS!
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
