import { Contract, utils } from "ethers"
import { ethers, upgrades } from "hardhat"
import { assert, expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

describe("VWBLFidemToken", () => {
    let accounts: SignerWithAddress[]
    let owner: SignerWithAddress
    let tokenOwner: SignerWithAddress
    let customer1: SignerWithAddress
    let customer2: SignerWithAddress
    let recipient1: SignerWithAddress
    let recipient2: SignerWithAddress

    let vwblGateway: Contract
    let gatewayProxy: Contract
    let accessControlCheckerByERC1155: Contract
    let vwblFidemToken: Contract

    const TEST_DOCUMENT_ID1 = "0x7c00000000000000000000000000000000000000000000000000000000000000"
    const TEST_DOCUMENT_ID2 = "0x3c00000000000000000000000000000000000000000000000000000000000000"
    const fee = utils.parseEther("1.0")
    const baseURI = "https://example.com/metadata/"

    beforeEach(async () => {
        accounts = await ethers.getSigners()
        owner = accounts[0]
        tokenOwner = accounts[1]
        customer1 = accounts[2]
        customer2 = accounts[3]
        recipient1 = accounts[4]
        recipient2 = accounts[5]

        // Deploy VWBL Gateway
        const VWBLGateway = await ethers.getContractFactory("VWBLGateway")
        vwblGateway = await VWBLGateway.deploy(fee)

        // Deploy Gateway Proxy
        const GatewayProxy = await ethers.getContractFactory("GatewayProxy")
        gatewayProxy = await GatewayProxy.deploy(vwblGateway.address)

        // Deploy Access Control Checker
        const AccessControlCheckerByERC1155 = await ethers.getContractFactory("AccessControlCheckerByERC1155")
        accessControlCheckerByERC1155 = await AccessControlCheckerByERC1155.deploy(gatewayProxy.address)
    })

    describe("Deployment & Initialization", () => {
        it("should deploy as a UUPS upgradeable proxy", async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                {
                    initializer: "initialize",
                    kind: "uups",
                }
            )

            await vwblFidemToken.deployed()

            expect(vwblFidemToken.address).to.be.properAddress
        })

        it("should initialize with correct parameters", async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                {
                    initializer: "initialize",
                    kind: "uups",
                }
            )

            expect(await vwblFidemToken.baseURI()).to.equal(baseURI)
            expect(await vwblFidemToken.gatewayProxy()).to.equal(gatewayProxy.address)
            expect(await vwblFidemToken.accessCheckerContract()).to.equal(accessControlCheckerByERC1155.address)
            expect(await vwblFidemToken.getSignMessage()).to.equal("Hello VWBL Fidem")
            expect(await vwblFidemToken.counter()).to.equal(0)
            expect(await vwblFidemToken.receiptCounter()).to.equal(0)
        })

        it("should set the deployer as owner", async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                {
                    initializer: "initialize",
                    kind: "uups",
                }
            )

            expect(await vwblFidemToken.owner()).to.equal(owner.address)
        })
    })

    describe("Token Creation with create()", () => {
        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )
        })

        context("When creating a token with revenue share configuration", () => {
            it("should create a new token and assign Token Owner", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [6000, 4000] // 60% / 40%

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })

                const receipt = await tx.wait()
                const tokenId = receipt.events?.find((e: any) => e.event === "TokenCreated")?.args?.tokenId

                expect(tokenId).to.equal(1)
                expect(await vwblFidemToken.tokenOwners(tokenId)).to.equal(tokenOwner.address)
            })

            it("should mint 1 token to the creator for permanent view access", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [6000, 4000]

                await vwblFidemToken
                    .connect(tokenOwner)
                    .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })

                const balance = await vwblFidemToken.balanceOf(tokenOwner.address, 1)
                expect(balance).to.equal(1)
            })

            it("should store revenue share configuration correctly", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [7000, 3000] // 70% / 30%

                await vwblFidemToken
                    .connect(tokenOwner)
                    .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })

                const config = await vwblFidemToken.getRevenueShareConfig(1)
                expect(config[0]).to.deep.equal(recipients)
                expect(config[1].map((s: any) => s.toNumber())).to.deep.equal(shares)
            })

            it("should emit TokenCreated event with correct data", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [5000, 5000]

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
                )
                    .to.emit(vwblFidemToken, "TokenCreated")
                    .withArgs(1, tokenOwner.address, TEST_DOCUMENT_ID1, recipients, shares)
            })
        })

        context("When validation fails", () => {
            it("should revert if arrays have different lengths", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [10000] // Mismatch

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
                ).to.be.revertedWith("Array length mismatch")
            })

            it("should revert if shares do not sum to 10000", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [6000, 3000] // Sum = 9000, not 10000

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
                ).to.be.revertedWith("Shares must equal 10000")
            })

            it("should revert if recipient is zero address", async () => {
                const recipients = [ethers.constants.AddressZero, recipient2.address]
                const shares = [6000, 4000]

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
                ).to.be.revertedWith("Zero address recipient")
            })

            it("should revert if recipients array is empty", async () => {
                const recipients: string[] = []
                const shares: number[] = []

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
                ).to.be.revertedWith("Empty recipients")
            })
        })
    })

    describe("Token Minting with mint()", () => {
        let tokenId: number

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            // Create a token first
            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = receipt.events?.find((e: any) => e.event === "TokenCreated")?.args?.tokenId.toNumber()
        })

        context("When Token Owner mints to a customer", () => {
            it("should mint token to customer", async () => {
                await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, utils.parseEther("100"), "FIDEM-001", "STRIPE-123", {
                        value: fee,
                    })

                const balance = await vwblFidemToken.balanceOf(customer1.address, tokenId)
                expect(balance).to.equal(1)
            })

            it("should create a receipt with correct data", async () => {
                const saleAmount = utils.parseEther("100")

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, saleAmount, "FIDEM-001", "STRIPE-123", { value: fee })

                const receipt = await tx.wait()
                const receiptId = receipt.events?.find((e: any) => e.event === "TokenMinted")?.args?.receiptId

                const storedReceipt = await vwblFidemToken.getReceipt(receiptId)
                expect(storedReceipt.tokenId).to.equal(tokenId)
                expect(storedReceipt.customer).to.equal(customer1.address)
                expect(storedReceipt.saleAmount).to.equal(saleAmount)
                expect(storedReceipt.fidemInvoiceId).to.equal("FIDEM-001")
                expect(storedReceipt.paymentInvoiceId).to.equal("STRIPE-123")
            })

            it("should calculate revenue distribution correctly", async () => {
                const saleAmount = utils.parseEther("100")

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, saleAmount, "FIDEM-001", "STRIPE-123", { value: fee })

                const receipt = await tx.wait()
                const receiptId = receipt.events?.find((e: any) => e.event === "TokenMinted")?.args?.receiptId

                const storedReceipt = await vwblFidemToken.getReceipt(receiptId)

                // 6000 basis points = 60% of 100 ETH = 60 ETH
                expect(storedReceipt.distribution.amounts[0]).to.equal(utils.parseEther("60"))
                // 4000 basis points = 40% of 100 ETH = 40 ETH
                expect(storedReceipt.distribution.amounts[1]).to.equal(utils.parseEther("40"))
            })

            it("should emit TokenMinted and ReceiptCreated events", async () => {
                const saleAmount = utils.parseEther("100")

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .mint(tokenId, customer1.address, saleAmount, "FIDEM-001", "STRIPE-123", { value: fee })
                )
                    .to.emit(vwblFidemToken, "TokenMinted")
                    .and.to.emit(vwblFidemToken, "ReceiptCreated")
            })
        })

        context("When non-Token Owner tries to mint", () => {
            it("should revert", async () => {
                await expect(
                    vwblFidemToken
                        .connect(customer1)
                        .mint(tokenId, customer2.address, utils.parseEther("100"), "FIDEM-001", "STRIPE-123", {
                            value: fee,
                        })
                ).to.be.revertedWith("Only Token Owner can mint")
            })
        })

        context("When insufficient fee is provided", () => {
            it("should revert", async () => {
                const insufficientFee = utils.parseEther("0.5")

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .mint(tokenId, customer1.address, utils.parseEther("100"), "FIDEM-001", "STRIPE-123", {
                            value: insufficientFee,
                        })
                ).to.be.revertedWith("Insufficient VWBL fee")
            })
        })
    })

    describe("Revenue Share Management", () => {
        let tokenId: number

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = receipt.events?.find((e: any) => e.event === "TokenCreated")?.args?.tokenId.toNumber()
        })

        context("When Token Owner updates revenue share", () => {
            it("should allow Token Owner to update configuration", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [7000, 3000]

                await vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)

                const config = await vwblFidemToken.getRevenueShareConfig(tokenId)
                expect(config[1].map((s: any) => s.toNumber())).to.deep.equal(newShares)
            })

            it("should emit RevenueShareUpdated event", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [5000, 5000]

                await expect(
                    vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)
                )
                    .to.emit(vwblFidemToken, "RevenueShareUpdated")
                    .withArgs(tokenId, newRecipients, newShares)
            })
        })

        context("When non-Token Owner tries to update", () => {
            it("should revert", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [7000, 3000]

                await expect(
                    vwblFidemToken.connect(customer1).updateRevenueShare(tokenId, newRecipients, newShares)
                ).to.be.revertedWith("Only Token Owner can update")
            })
        })

        context("When Contract Owner updates revenue share", () => {
            it("should allow Contract Owner to update any token", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [8000, 2000]

                await vwblFidemToken.connect(owner).updateRevenueShareByAdmin(tokenId, newRecipients, newShares)

                const config = await vwblFidemToken.getRevenueShareConfig(tokenId)
                expect(config[1].map((s: any) => s.toNumber())).to.deep.equal(newShares)
            })
        })

        context("When validation fails on update", () => {
            it("should revert if shares do not sum to 10000", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [6000, 3000] // Sum = 9000

                await expect(
                    vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)
                ).to.be.revertedWith("Shares must equal 10000")
            })
        })
    })

    describe("Transfer Restrictions (SBT-like)", () => {
        let tokenId: number

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = receipt.events?.find((e: any) => e.event === "TokenCreated")?.args?.tokenId.toNumber()

            // Mint to customer
            await vwblFidemToken
                .connect(tokenOwner)
                .mint(tokenId, customer1.address, utils.parseEther("100"), "FIDEM-001", "STRIPE-123", { value: fee })
        })

        context("When attempting normal transfer", () => {
            it("should block direct transfers", async () => {
                await expect(
                    vwblFidemToken
                        .connect(customer1)
                        .safeTransferFrom(customer1.address, customer2.address, tokenId, 1, "0x")
                ).to.be.revertedWith("Transfers restricted - use safeTransferByOwner")
            })

            it("should block batch transfers", async () => {
                await expect(
                    vwblFidemToken
                        .connect(customer1)
                        .safeBatchTransferFrom(customer1.address, customer2.address, [tokenId], [1], "0x")
                ).to.be.revertedWith("Transfers restricted - use safeTransferByOwner")
            })
        })

        context("When Contract Owner authorizes transfer", () => {
            it("should allow one-time transfer with owner authorization", async () => {
                await vwblFidemToken
                    .connect(owner)
                    .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)

                const balance1 = await vwblFidemToken.balanceOf(customer1.address, tokenId)
                const balance2 = await vwblFidemToken.balanceOf(customer2.address, tokenId)

                expect(balance1).to.equal(0)
                expect(balance2).to.equal(1)
            })

            it("should mark the token as transferred", async () => {
                await vwblFidemToken
                    .connect(owner)
                    .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)

                const status = await vwblFidemToken.transferStatus(tokenId, customer1.address)
                expect(status.hasTransferred).to.be.true
                expect(status.transferredTo).to.equal(customer2.address)
            })

            it("should emit TransferByOwner event", async () => {
                await expect(
                    vwblFidemToken
                        .connect(owner)
                        .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)
                )
                    .to.emit(vwblFidemToken, "TransferByOwner")
                    .withArgs(customer1.address, customer2.address, tokenId, 1)
            })
        })

        context("When attempting second transfer", () => {
            it("should block second transfer from the same address", async () => {
                // First transfer succeeds
                await vwblFidemToken
                    .connect(owner)
                    .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)

                // Mint another token to customer1
                await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, utils.parseEther("50"), "FIDEM-002", "STRIPE-124", { value: fee })

                // Second transfer should fail
                await expect(
                    vwblFidemToken
                        .connect(owner)
                        .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)
                ).to.be.revertedWith("Already transferred")
            })
        })

        context("When non-owner tries to authorize transfer", () => {
            it("should revert", async () => {
                await expect(
                    vwblFidemToken
                        .connect(customer1)
                        .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })
        })

        context("Burning tokens", () => {
            it("should allow burning own tokens", async () => {
                await vwblFidemToken.connect(customer1).burn(customer1.address, tokenId, 1)

                const balance = await vwblFidemToken.balanceOf(customer1.address, tokenId)
                expect(balance).to.equal(0)
            })
        })
    })

    describe("Receipt Query Functions", () => {
        let tokenId: number
        let receiptId1: number
        let receiptId2: number

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = receipt.events?.find((e: any) => e.event === "TokenCreated")?.args?.tokenId.toNumber()

            // Mint to customer1
            const tx1 = await vwblFidemToken
                .connect(tokenOwner)
                .mint(tokenId, customer1.address, utils.parseEther("100"), "FIDEM-001", "STRIPE-123", { value: fee })
            const receipt1 = await tx1.wait()
            receiptId1 = receipt1.events?.find((e: any) => e.event === "TokenMinted")?.args?.receiptId.toNumber()

            // Mint to customer2
            const tx2 = await vwblFidemToken
                .connect(tokenOwner)
                .mint(tokenId, customer2.address, utils.parseEther("50"), "FIDEM-002", "STRIPE-124", { value: fee })
            const receipt2 = await tx2.wait()
            receiptId2 = receipt2.events?.find((e: any) => e.event === "TokenMinted")?.args?.receiptId.toNumber()
        })

        it("should retrieve receipt by ID", async () => {
            const receipt = await vwblFidemToken.getReceipt(receiptId1)

            expect(receipt.receiptId).to.equal(receiptId1)
            expect(receipt.customer).to.equal(customer1.address)
            expect(receipt.fidemInvoiceId).to.equal("FIDEM-001")
        })

        it("should get all receipts for a token", async () => {
            const receiptIds = await vwblFidemToken.getReceiptsByToken(tokenId)

            expect(receiptIds.length).to.equal(2)
            expect(receiptIds[0]).to.equal(receiptId1)
            expect(receiptIds[1]).to.equal(receiptId2)
        })

        it("should get all receipts for a customer", async () => {
            const receiptIds = await vwblFidemToken.getReceiptsByCustomer(customer1.address)

            expect(receiptIds.length).to.equal(1)
            expect(receiptIds[0]).to.equal(receiptId1)
        })

        it("should get receipt count for a token", async () => {
            const count = await vwblFidemToken.getReceiptCountByToken(tokenId)
            expect(count).to.equal(2)
        })

        it("should get receipt count for a customer", async () => {
            const count = await vwblFidemToken.getReceiptCountByCustomer(customer1.address)
            expect(count).to.equal(1)
        })

        it("should paginate receipts for a token", async () => {
            const receipts = await vwblFidemToken.getReceiptsByTokenPaginated(tokenId, 0, 1)

            expect(receipts.length).to.equal(1)
            expect(receipts[0].receiptId).to.equal(receiptId1)
        })

        it("should return empty array for token with no receipts", async () => {
            // Create a new token without minting
            const newRecipients = [recipient1.address]
            const newShares = [10000]
            await vwblFidemToken
                .connect(tokenOwner)
                .create("https://example.com", ethers.utils.formatBytes32String("doc2"), newRecipients, newShares, {
                    value: fee,
                })
            const newTokenId = 2

            // Should return empty array, not revert
            const receipts = await vwblFidemToken.getReceiptsByTokenPaginated(newTokenId, 0, 10)
            expect(receipts.length).to.equal(0)
        })
    })

    describe("Upgradeability", () => {
        let proxyAddress: string

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, gatewayProxy.address, accessControlCheckerByERC1155.address, "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            proxyAddress = vwblFidemToken.address

            // Create a token
            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
        })

        it("should preserve state after upgrade", async () => {
            // Get state before upgrade
            const counterBefore = await vwblFidemToken.counter()
            const tokenOwnerBefore = await vwblFidemToken.tokenOwners(1)

            // Deploy V2 (same contract for testing)
            const VWBLFidemTokenV2 = await ethers.getContractFactory("VWBLFidemToken")
            const upgraded = await upgrades.upgradeProxy(proxyAddress, VWBLFidemTokenV2)

            // Verify state is preserved
            const counterAfter = await upgraded.counter()
            const tokenOwnerAfter = await upgraded.tokenOwners(1)

            expect(counterAfter).to.equal(counterBefore)
            expect(tokenOwnerAfter).to.equal(tokenOwnerBefore)
        })

        it("should only allow owner to upgrade", async () => {
            const VWBLFidemTokenV2 = await ethers.getContractFactory("VWBLFidemToken")

            // Non-owner cannot upgrade
            await expect(upgrades.upgradeProxy(proxyAddress, VWBLFidemTokenV2.connect(customer1))).to.be.reverted
        })
    })
})
