import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

import { initialTokenReserve, initialEthReserve, initialTokenFund, MAX_LEVERAGE } from "./constants";

describe("TokenVault contract", function () {
    async function deployTokenVaultFixture() {
        const [owner, userAccount] = await hre.viem.getWalletClients();

        const MockUSDC = await hre.viem.deployContract("MockERC20", ["Mock Token", "MTK"]);

        await MockUSDC.write.mint([userAccount.account.address, initialTokenFund]);

        const TokenVault = await hre.viem.deployContract("TokenVault", [MockUSDC.address]);

        const VAMM = await hre.viem.deployContract("vAMM", [
            TokenVault.address,
            MockUSDC.address,
            initialTokenReserve,
            initialEthReserve,
        ]);
        await TokenVault.write.setAMMAddress([VAMM.address]);

        return { TokenVault, MockUSDC, VAMM, owner, userAccount };
    }

    describe("Deployment", function () {
        it("Should deploy the TokenVault contract", async function () {
            const { TokenVault } = await loadFixture(deployTokenVaultFixture);
            expect(TokenVault).to.not.be.null;
        });
    });

    describe("AMM Address", function () {
        it("Should set the AMM address correctly", async function () {
            const { TokenVault, VAMM } = await loadFixture(deployTokenVaultFixture);
            expect((await TokenVault.read.ammAddress()).toLowerCase()).to.equal(VAMM.address.toLowerCase());
        });

        it("Should revert if trying to set the AMM address more than once", async function () {
            const { TokenVault, VAMM } = await loadFixture(deployTokenVaultFixture);
            await expect(TokenVault.write.setAMMAddress([VAMM.address])).to.be.rejectedWith("AMM address has been set");
        });
    });

    describe("Token Operations", function () {
        it("Should deposit tokens correctly", async function () {
            const { TokenVault, MockUSDC, userAccount } = await loadFixture(deployTokenVaultFixture);

            await MockUSDC.write.approve([TokenVault.address, initialTokenFund], { account: userAccount.account.address });
            await TokenVault.write.depositToken([initialTokenFund], { account: userAccount.account.address });

            expect(await TokenVault.read.virtualBalanceOf([userAccount.account.address])).to.equal(initialTokenFund * MAX_LEVERAGE);
        });

        it("Should withdraw tokens correctly", async function () {
            const { TokenVault, MockUSDC, userAccount } = await loadFixture(deployTokenVaultFixture);

            await MockUSDC.write.approve([TokenVault.address, initialTokenFund], { account: userAccount.account.address });
            await TokenVault.write.depositToken([initialTokenFund], { account: userAccount.account.address });

            await TokenVault.write.withdrawToken([initialTokenFund], { account: userAccount.account.address });

            expect(await TokenVault.read.virtualBalanceOf([userAccount.account.address])).to.equal(BigInt(0));
            expect((await MockUSDC.read.balanceOf([userAccount.account.address])) - initialTokenFund).to.equal(BigInt(0));
        });

        it("Should revert withdrawal if balance is insufficient", async function () {
            const { TokenVault, userAccount } = await loadFixture(deployTokenVaultFixture);

            await expect(TokenVault.write.withdrawToken([initialTokenFund], { account: userAccount.account.address })).to.be.rejectedWith("Insufficient balance");
        });
    });

    describe("Position Operations", function () {
        it("Should open and close positions correctly by the AMM", async function () {
            const { TokenVault, MockUSDC, userAccount, VAMM } = await loadFixture(deployTokenVaultFixture);

            await MockUSDC.write.approve([TokenVault.address, initialTokenFund], { account: userAccount.account.address });
            await TokenVault.write.depositToken([initialTokenFund], { account: userAccount.account.address });

            await VAMM.write.openPosition([initialTokenFund * BigInt(2), true], { account: userAccount.account.address }); // used 2x leverage
            expect(await TokenVault.read.virtualBalanceOf([userAccount.account.address])).to.equal(initialTokenFund * BigInt(8)); // 8x leverage remaining

            await VAMM.write.closePosition([0], { account: userAccount.account.address }); // sell the position back to regain the amount of initial fund
            expect(await TokenVault.read.virtualBalanceOf([userAccount.account.address])).to.equal(initialTokenFund * MAX_LEVERAGE);
        });

        it("Should revert position operations if called by non-AMM", async function () {
            const { TokenVault, userAccount } = await loadFixture(deployTokenVaultFixture);

            await expect(TokenVault.write.openPosition([initialTokenFund, userAccount.account.address])).to.be.rejectedWith("Only AMM can call this function");
            await expect(TokenVault.write.closePosition([initialTokenFund, userAccount.account.address])).to.be.rejectedWith("Only AMM can call this function");
        });
    });
});