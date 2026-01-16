// Deploy VWBL dependencies (GatewayProxy and AccessControlCheckerByERC1155)
import { ethers } from "hardhat"

async function main() {
    console.log("Deploying VWBL dependencies...")

    // 1. Deploy VWBLGateway (implementation)
    console.log("\n1. Deploying VWBLGateway...")
    const VWBLGateway = await ethers.getContractFactory("VWBLGateway")
    const feeWei = 0 // Free for testing
    const gateway = await VWBLGateway.deploy(feeWei)
    await gateway.waitForDeployment()
    const gatewayAddress = await gateway.getAddress()
    console.log("VWBLGateway deployed to:", gatewayAddress)
    console.log("Fee set to: FREE (0 wei)")

    // 2. Deploy GatewayProxy
    console.log("\n2. Deploying GatewayProxy...")
    const GatewayProxy = await ethers.getContractFactory("GatewayProxy")
    const gatewayProxy = await GatewayProxy.deploy(gatewayAddress)
    await gatewayProxy.waitForDeployment()
    const gatewayProxyAddress = await gatewayProxy.getAddress()
    console.log("GatewayProxy deployed to:", gatewayProxyAddress)

    // 3. Deploy AccessControlCheckerByERC1155
    console.log("\n3. Deploying AccessControlCheckerByERC1155...")
    const AccessControlChecker = await ethers.getContractFactory("AccessControlCheckerByERC1155")
    const accessControlChecker = await AccessControlChecker.deploy(gatewayProxyAddress)
    await accessControlChecker.waitForDeployment()
    const accessControlCheckerAddress = await accessControlChecker.getAddress()
    console.log("AccessControlCheckerByERC1155 deployed to:", accessControlCheckerAddress)

    console.log("\n✅ All dependencies deployed successfully!")
    console.log("\nAdd these to your .env file:")
    console.log(`GATEWAY_PROXY_ADDRESS=${gatewayProxyAddress}`)
    console.log(`ACCESS_CONTROL_CHECKER_BY_ERC1155_ADDRESS=${accessControlCheckerAddress}`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
