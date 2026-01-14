// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, upgrades } from "hardhat"
import * as dotenv from "dotenv"
dotenv.config()

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        console.error(`Error: ${name} environment variable is not set`)
        console.error(`Please set ${name} in your config/.env.* file`)
        process.exit(1)
    }
    return value
}

async function main() {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    const baseURI = requireEnv("METADATA_URL")
    console.log("VWBL Metadata URL: ", baseURI)

    const gatewayProxyContractAddress = requireEnv("GATEWAY_PROXY_ADDRESS")
    const accessControlCheckerByERC1155ContractAddress = requireEnv("ACCESS_CONTROL_CHECKER_BY_ERC1155_ADDRESS")
    const messageToBeSigned = requireEnv("MESSAGE_TO_BE_SIGNED")
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

    await proxy.waitForDeployment()

    const proxyAddress = await proxy.getAddress()
    console.log("VWBLFidemToken proxy deployed to:", proxyAddress)

    // Get implementation address
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
    console.log("Implementation deployed to:", implAddress)

    // For UUPS, the proxy itself manages upgrades via AccessControl
    console.log("\nDeployment complete!")
    console.log("The deployer has been granted DEFAULT_ADMIN_ROLE and MINTER_ROLE")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
