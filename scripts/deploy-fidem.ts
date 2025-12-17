// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, upgrades } from "hardhat"
import * as dotenv from "dotenv"
dotenv.config()

async function main() {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    const baseURI = process.env.METADATA_URL!
    console.log("VWBL Metadata URL: ", baseURI)

    const gatewayProxyContractAddress = process.env.GATEWAY_PROXY_ADDRESS!
    const accessControlCheckerByERC1155ContractAddress = process.env.ACCESS_CONTROL_CHECKER_BY_ERC1155_ADDRESS!
    const messageToBeSigned = process.env.MESSAGE_TO_BE_SIGNED!
    console.log("Message to be signed: ", messageToBeSigned)

    console.log("Deploying VWBLFidemToken with UUPS proxy pattern...")

    // Get contract factory
    const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

    // Deploy upgradeable proxy
    const proxy = await upgrades.deployProxy(
        VWBLFidemToken,
        [
            baseURI,
            gatewayProxyContractAddress,
            accessControlCheckerByERC1155ContractAddress,
            messageToBeSigned
        ],
        {
            initializer: 'initialize',
            kind: 'uups'  // Use UUPS pattern
        }
    )

    await proxy.deployed()

    console.log("VWBLFidemToken proxy deployed to:", proxy.address)

    // Get implementation address
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxy.address)
    console.log("Implementation deployed to:", implAddress)

    // Get admin address (for UUPS, this is typically the proxy itself)
    console.log("Proxy admin:", await proxy.owner())
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
