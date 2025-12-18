import { Contract } from "ethers"
import { ethers, upgrades } from "hardhat"
import { assert, expect } from "chai"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

describe("VWBLFidemToken", () => {
    let accounts: HardhatEthersSigner[]
    let owner: HardhatEthersSigner
    let tokenOwner: HardhatEthersSigner
    let customer1: HardhatEthersSigner
    let customer2: HardhatEthersSigner
    let recipient1: HardhatEthersSigner
    let recipient2: HardhatEthersSigner

    let vwblGateway: Contract
    let gatewayProxy: Contract
    let accessControlCheckerByERC1155: Contract
    let vwblFidemToken: Contract

    const TEST_DOCUMENT_ID1 = "0x7c00000000000000000000000000000000000000000000000000000000000000"
    const TEST_DOCUMENT_ID2 = "0x3c00000000000000000000000000000000000000000000000000000000000000"
    const fee = ethers.parseEther("1.0")
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
        gatewayProxy = await GatewayProxy.deploy(await vwblGateway.getAddress())

        // Deploy Access Control Checker
        const AccessControlCheckerByERC1155 = await ethers.getContractFactory("AccessControlCheckerByERC1155")
        accessControlCheckerByERC1155 = await AccessControlCheckerByERC1155.deploy(await gatewayProxy.getAddress())
    })

    describe("Deployment & Initialization", () => {
        it("should deploy as a UUPS upgradeable proxy", async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                {
                    initializer: "initialize",
                    kind: "uups",
                }
            )


            // Grant roles to tokenOwner for testing

            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()


            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)


            expect(await vwblFidemToken.getAddress()).to.be.properAddress
        })

        it("should initialize with correct parameters", async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                {
                    initializer: "initialize",
                    kind: "uups",
                }
            )


            // Grant roles to tokenOwner for testing

            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()


            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)


            expect(await vwblFidemToken.baseURI()).to.equal(baseURI)
            expect(await vwblFidemToken.gatewayProxy()).to.equal(await gatewayProxy.getAddress())
            expect(await vwblFidemToken.accessCheckerContract()).to.equal(await accessControlCheckerByERC1155.getAddress())
            expect(await vwblFidemToken.getSignMessage()).to.equal("Hello VWBL Fidem")
            expect(await vwblFidemToken.counter()).to.equal(0)
            expect(await vwblFidemToken.receiptCounter()).to.equal(0)
        })

        it("should grant DEFAULT_ADMIN_ROLE to deployer", async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")

            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                {
                    initializer: "initialize",
                    kind: "uups",
                }
            )


            // Grant roles to tokenOwner for testing

            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()


            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)


            const DEFAULT_ADMIN_ROLE = await vwblFidemToken.DEFAULT_ADMIN_ROLE()
            expect(await vwblFidemToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true
        })
    })

    describe("Token Creation with create()", () => {
        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            // Grant roles to tokenOwner for testing
            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()
            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)
        })

        context("When creating a token with revenue share configuration", () => {
            it("should create a new token", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [6000, 4000] // 60% / 40%

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })

                const receipt = await tx.wait()
                const tokenId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenCreated"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.tokenId; })()

                expect(tokenId).to.equal(1)
            })

            it("should grant access control to token owner without minting token", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [6000, 4000]

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })

                const receipt = await tx.wait()
                const tokenId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenCreated"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.tokenId; })()

                // Verify token owner does NOT hold any tokens
                const balance = await vwblFidemToken.balanceOf(tokenOwner.address, tokenId)
                expect(balance).to.equal(0)

                // Verify token owner is recorded as minter (which grants access control)
                const tokenInfo = await vwblFidemToken.tokenIdToTokenInfo(tokenId)
                expect(tokenInfo.minterAddress).to.equal(tokenOwner.address)
                expect(tokenInfo.documentId).to.equal(TEST_DOCUMENT_ID1)

                // Token owner has access control through minter status, not token ownership
            })

            it("should store revenue share configuration correctly", async () => {
                const recipients = [recipient1.address, recipient2.address]
                const shares = [7000, 3000] // 70% / 30%

                await vwblFidemToken
                    .connect(tokenOwner)
                    .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })

                const config = await vwblFidemToken.getRevenueShareConfig(1)
                expect(config[0]).to.deep.equal(recipients)
                expect(config[1].map((s: any) => s)).to.deep.equal(shares)
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
                    .withArgs(1, TEST_DOCUMENT_ID1, recipients, shares)
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
                ).to.be.revertedWith("Shares must equal BASIS_POINTS_TOTAL")
            })

            it("should revert if recipient is zero address", async () => {
                const recipients = [ethers.ZeroAddress, recipient2.address]
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
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            // Grant roles to tokenOwner for testing
            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()
            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)

            // Create a token first
            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenCreated"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.tokenId; })()
        })

        context("When Token Owner mints to a customer", () => {
            it("should mint token to customer", async () => {
                await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, ethers.parseEther("100"),  "STRIPE-123", {
                        value: fee,
                    })

                const balance = await vwblFidemToken.balanceOf(customer1.address, tokenId)
                expect(balance).to.equal(1)
            })

            it("should create a receipt with correct data", async () => {
                const saleAmount = ethers.parseEther("100")

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, saleAmount,  "STRIPE-123", { value: fee })

                const receipt = await tx.wait()
                const receiptId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenMinted"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.receiptId; })()

                const storedReceipt = await vwblFidemToken.getReceipt(receiptId)
                expect(storedReceipt.tokenId).to.equal(tokenId)
                expect(storedReceipt.customer).to.equal(customer1.address)
                expect(storedReceipt.saleAmount).to.equal(saleAmount)
                expect(storedReceipt.paymentInvoiceId).to.equal("STRIPE-123")
            })

            it("should store immutable snapshot of revenue share at purchase time", async () => {
                const saleAmount = ethers.parseEther("100")

                // First purchase with original share configuration [6000, 4000]
                const tx1 = await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, saleAmount,  "STRIPE-123", { value: fee })

                const receipt1 = await tx1.wait()
                const receiptId1 = (() => { const log = receipt1.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenMinted"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.receiptId; })()

                // Verify first receipt has original shares
                const storedReceipt1 = await vwblFidemToken.getReceipt(receiptId1)
                expect(storedReceipt1.recipients).to.deep.equal([recipient1.address, recipient2.address])
                expect(storedReceipt1.shares.map((s: any) => s)).to.deep.equal([6000, 4000])

                // Update revenue share configuration to [5000, 5000]
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [5000, 5000]
                await vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)

                // Second purchase with new share configuration [5000, 5000]
                const tx2 = await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer2.address, saleAmount,  "STRIPE-456", { value: fee })

                const receipt2 = await tx2.wait()
                const receiptId2 = (() => { const log = receipt2.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenMinted"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.receiptId; })()

                // Verify second receipt has new shares
                const storedReceipt2 = await vwblFidemToken.getReceipt(receiptId2)
                expect(storedReceipt2.recipients).to.deep.equal([recipient1.address, recipient2.address])
                expect(storedReceipt2.shares.map((s: any) => s)).to.deep.equal([5000, 5000])

                // CRITICAL: Verify first receipt STILL has original shares (immutable)
                const storedReceipt1Again = await vwblFidemToken.getReceipt(receiptId1)
                expect(storedReceipt1Again.recipients).to.deep.equal([recipient1.address, recipient2.address])
                expect(storedReceipt1Again.shares.map((s: any) => s)).to.deep.equal([6000, 4000])
            })

            it("should emit TokenMinted and ReceiptCreated events", async () => {
                const saleAmount = ethers.parseEther("100")

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .mint(tokenId, customer1.address, saleAmount,  "STRIPE-123", { value: fee })
                )
                    .to.emit(vwblFidemToken, "TokenMinted")
                    .and.to.emit(vwblFidemToken, "ReceiptCreated")
            })
        })

        context("When account without MINTER_ROLE tries to mint", () => {
            it("should revert", async () => {
                await expect(
                    vwblFidemToken
                        .connect(customer1)
                        .mint(tokenId, customer2.address, ethers.parseEther("100"),  "STRIPE-123", {
                            value: fee,
                        })
                ).to.be.reverted // AccessControl will revert
            })
        })

        context("When insufficient fee is provided", () => {
            it("should revert", async () => {
                const insufficientFee = ethers.parseEther("0.5")

                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .mint(tokenId, customer1.address, ethers.parseEther("100"),  "STRIPE-123", {
                            value: insufficientFee,
                        })
                ).to.be.revertedWith("Insufficient VWBL fee")
            })
        })

        context("When customer address is zero", () => {
            it("should revert", async () => {
                await expect(
                    vwblFidemToken
                        .connect(tokenOwner)
                        .mint(tokenId, ethers.ZeroAddress, ethers.parseEther("100"),  "STRIPE-123", {
                            value: fee,
                        })
                ).to.be.revertedWith("Invalid customer address")
            })
        })

        context("When excess ETH is provided", () => {
            it("should refund excess ETH to msg.sender", async () => {
                const excessFee = ethers.parseEther("2.0") // 2 ETH when only 1 ETH is required
                const balanceBefore = await ethers.provider.getBalance(tokenOwner.address)

                const tx = await vwblFidemToken
                    .connect(tokenOwner)
                    .mint(tokenId, customer1.address, ethers.parseEther("100"),  "STRIPE-123", {
                        value: excessFee,
                    })
                const receipt = await tx.wait()

                const balanceAfter = await ethers.provider.getBalance(tokenOwner.address)
                const gasCost = receipt.gasUsed * receipt.gasPrice

                // Balance should be: before - fee - gas + refund
                // Or: before - fee - gas, since refund = excessFee - fee
                // So: before - excessFee - gas + (excessFee - fee) = before - fee - gas
                const expectedBalance = balanceBefore - fee - gasCost

                expect(balanceAfter).to.equal(expectedBalance)
            })
        })
    })

    describe("Revenue Share Management", () => {
        let tokenId: number

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )

            // Grant roles to tokenOwner for testing
            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()
            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)

            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenCreated"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.tokenId; })()
        })

        context("When Token Owner updates revenue share", () => {
            it("should allow Token Owner to update configuration", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [7000, 3000]

                await vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)

                const config = await vwblFidemToken.getRevenueShareConfig(tokenId)
                expect(config[1].map((s: any) => s)).to.deep.equal(newShares)
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
                ).to.be.reverted
            })
        })

        context("When Contract Owner updates revenue share", () => {
            it("should allow Contract Owner to update any token", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [8000, 2000]

                await vwblFidemToken.connect(owner).updateRevenueShare(tokenId, newRecipients, newShares)

                const config = await vwblFidemToken.getRevenueShareConfig(tokenId)
                expect(config[1].map((s: any) => s)).to.deep.equal(newShares)
            })
        })

        context("Revenue share history tracking", () => {
            it("should have empty history initially", async () => {
                const historyCount = await vwblFidemToken.getRevenueShareHistoryCount(tokenId)
                expect(historyCount).to.equal(0)

                const history = await vwblFidemToken.getRevenueShareHistory(tokenId)
                expect(history.length).to.equal(0)
            })

            it("should save history when Token Owner updates revenue share", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [7000, 3000]

                // Update revenue share
                await vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)

                // Verify history was saved
                const historyCount = await vwblFidemToken.getRevenueShareHistoryCount(tokenId)
                expect(historyCount).to.equal(1)

                const history = await vwblFidemToken.getRevenueShareHistory(tokenId)
                expect(history.length).to.equal(1)

                // Verify history contains original configuration [6000, 4000]
                expect(history[0].recipients).to.deep.equal([recipient1.address, recipient2.address])
                expect(history[0].shares.map((s: any) => s)).to.deep.equal([6000, 4000])
                expect(history[0].updatedBy).to.equal(tokenOwner.address)
            })

            it("should save multiple history entries on multiple updates", async () => {
                // First update: [6000, 4000] → [7000, 3000]
                await vwblFidemToken
                    .connect(tokenOwner)
                    .updateRevenueShare(tokenId, [recipient1.address, recipient2.address], [7000, 3000])

                // Second update: [7000, 3000] → [5000, 5000]
                await vwblFidemToken
                    .connect(tokenOwner)
                    .updateRevenueShare(tokenId, [recipient1.address, recipient2.address], [5000, 5000])

                // Third update: [5000, 5000] → [8000, 2000]
                await vwblFidemToken
                    .connect(tokenOwner)
                    .updateRevenueShare(tokenId, [recipient1.address, recipient2.address], [8000, 2000])

                // Verify 3 history entries
                const historyCount = await vwblFidemToken.getRevenueShareHistoryCount(tokenId)
                expect(historyCount).to.equal(3)

                const history = await vwblFidemToken.getRevenueShareHistory(tokenId)

                // First history entry: original [6000, 4000]
                expect(history[0].shares.map((s: any) => s)).to.deep.equal([6000, 4000])

                // Second history entry: [7000, 3000]
                expect(history[1].shares.map((s: any) => s)).to.deep.equal([7000, 3000])

                // Third history entry: [5000, 5000]
                expect(history[2].shares.map((s: any) => s)).to.deep.equal([5000, 5000])

                // Current config should be [8000, 2000]
                const currentConfig = await vwblFidemToken.getRevenueShareConfig(tokenId)
                expect(currentConfig[1].map((s: any) => s)).to.deep.equal([8000, 2000])
            })

            it("should record correct updatedBy address in history", async () => {
                // Token owner updates
                await vwblFidemToken
                    .connect(tokenOwner)
                    .updateRevenueShare(tokenId, [recipient1.address, recipient2.address], [7000, 3000])

                // Contract owner (admin) updates
                await vwblFidemToken
                    .connect(owner)
                    .updateRevenueShare(tokenId, [recipient1.address, recipient2.address], [5000, 5000])

                const history = await vwblFidemToken.getRevenueShareHistory(tokenId)

                // First update was by tokenOwner
                expect(history[0].updatedBy).to.equal(tokenOwner.address)

                // Second update was by owner (admin)
                expect(history[1].updatedBy).to.equal(owner.address)
            })

            it("should emit RevenueShareHistorySaved event", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [7000, 3000]

                await expect(
                    vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)
                )
                    .to.emit(vwblFidemToken, "RevenueShareHistorySaved")
                    .and.to.emit(vwblFidemToken, "RevenueShareUpdated")
            })
        })

        context("When validation fails on update", () => {
            it("should revert if shares do not sum to 10000", async () => {
                const newRecipients = [recipient1.address, recipient2.address]
                const newShares = [6000, 3000] // Sum = 9000

                await expect(
                    vwblFidemToken.connect(tokenOwner).updateRevenueShare(tokenId, newRecipients, newShares)
                ).to.be.revertedWith("Shares must equal BASIS_POINTS_TOTAL")
            })
        })
    })

    describe("Transfer Restrictions (SBT-like)", () => {
        let tokenId: number

        beforeEach(async () => {
            const VWBLFidemToken = await ethers.getContractFactory("VWBLFidemToken")
            vwblFidemToken = await upgrades.deployProxy(
                VWBLFidemToken,
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )


            // Grant roles to tokenOwner for testing

            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()


            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)


            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenCreated"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.tokenId; })()

            // Mint to customer
            await vwblFidemToken
                .connect(tokenOwner)
                .mint(tokenId, customer1.address, ethers.parseEther("100"),  "STRIPE-123", { value: fee })
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

                // Should mark the TO address (customer2), not FROM address
                const status = await vwblFidemToken.transferStatus(tokenId, customer2.address)
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
            it("should block transfer from address that received via owner transfer", async () => {
                // First transfer: customer1 → customer2 (succeeds)
                await vwblFidemToken
                    .connect(owner)
                    .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)

                // Second transfer: customer2 → recipient1 (should fail)
                // customer2 received via owner transfer, so cannot send via owner transfer
                await expect(
                    vwblFidemToken
                        .connect(owner)
                        .safeTransferByOwner(customer2.address, recipient1.address, tokenId, 1)
                ).to.be.revertedWith("Already transferred")
            })
        })

        context("When non-owner tries to authorize transfer", () => {
            it("should revert", async () => {
                await expect(
                    vwblFidemToken
                        .connect(customer1)
                        .safeTransferByOwner(customer1.address, customer2.address, tokenId, 1)
                ).to.be.reverted
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
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )


            // Grant roles to tokenOwner for testing

            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()


            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)


            const recipients = [recipient1.address, recipient2.address]
            const shares = [6000, 4000]
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://vwbl.network/key", TEST_DOCUMENT_ID1, recipients, shares, { value: fee })
            const receipt = await tx.wait()
            tokenId = (() => { const log = receipt.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenCreated"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.tokenId; })()

            // Mint to customer1
            const tx1 = await vwblFidemToken
                .connect(tokenOwner)
                .mint(tokenId, customer1.address, ethers.parseEther("100"),  "STRIPE-123", { value: fee })
            const receipt1 = await tx1.wait()
            receiptId1 = (() => { const log = receipt1.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenMinted"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.receiptId; })()

            // Mint to customer2
            const tx2 = await vwblFidemToken
                .connect(tokenOwner)
                .mint(tokenId, customer2.address, ethers.parseEther("50"),  "STRIPE-124", { value: fee })
            const receipt2 = await tx2.wait()
            receiptId2 = (() => { const log = receipt2.logs.find(l => { try { const parsed = vwblFidemToken.interface.parseLog(l); return parsed?.name === "TokenMinted"; } catch { return false; } }); if (!log) return undefined; return vwblFidemToken.interface.parseLog(log).args.receiptId; })()
        })

        it("should retrieve receipt by ID", async () => {
            const receipt = await vwblFidemToken.getReceipt(receiptId1)

            expect(receipt.receiptId).to.equal(receiptId1)
            expect(receipt.customer).to.equal(customer1.address)
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
            const tx = await vwblFidemToken
                .connect(tokenOwner)
                .create("https://example.com", ethers.encodeBytes32String("doc2"), newRecipients, newShares, {
                    value: fee,
                })

            // Get the tokenId from the TokenCreated event
            const receipt = await tx.wait()
            const event = receipt?.logs
                .map(log => {
                    try {
                        return vwblFidemToken.interface.parseLog({ topics: [...log.topics], data: log.data })
                    } catch {
                        return null
                    }
                })
                .find(parsed => parsed?.name === "TokenCreated")

            const newTokenId = event?.args[0]

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
                [baseURI, await gatewayProxy.getAddress(), await accessControlCheckerByERC1155.getAddress(), "Hello VWBL Fidem"],
                { initializer: "initialize", kind: "uups" }
            )


            // Grant roles to tokenOwner for testing

            const MINTER_ROLE = await vwblFidemToken.MINTER_ROLE()


            await vwblFidemToken.connect(owner).grantRole(MINTER_ROLE, tokenOwner.address)


            proxyAddress = await vwblFidemToken.getAddress()

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

            // Deploy V2 (same contract for testing)
            const VWBLFidemTokenV2 = await ethers.getContractFactory("VWBLFidemToken")
            const upgraded = await upgrades.upgradeProxy(proxyAddress, VWBLFidemTokenV2)

            // Verify state is preserved
            const counterAfter = await upgraded.counter()

            expect(counterAfter).to.equal(counterBefore)
        })

        it("should only allow owner to upgrade", async () => {
            const VWBLFidemTokenV2 = await ethers.getContractFactory("VWBLFidemToken")

            // Non-owner cannot upgrade
            await expect(upgrades.upgradeProxy(proxyAddress, VWBLFidemTokenV2.connect(customer1))).to.be.reverted
        })
    })
})
