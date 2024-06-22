import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

import { initialTokenReserve, initialEthReserve, initialTokenFund, MAX_LEVERAGE } from "./constants";

describe("vAMM contract", function () {
  async function deployVAMMFixture() {
    const [owner, _, otherAccount] = await hre.viem.getWalletClients();

    const MockUSDC = await hre.viem.deployContract("MockERC20", ["Mock Token", "MTK"]);
    await MockUSDC.write.mint([otherAccount.account.address, initialTokenFund]);

    const TokenVault = await hre.viem.deployContract("TokenVault", [MockUSDC.address]);

    const VAMM = await hre.viem.deployContract("vAMM", [
      TokenVault.address,
      MockUSDC.address,
      initialTokenReserve,
      initialEthReserve,
    ]);

    TokenVault.write.setAMMAddress([VAMM.address]);

    return { VAMM, TokenVault, MockUSDC, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should deploy the vAMM contract", async function () {
      const { VAMM } = await loadFixture(deployVAMMFixture);
      expect(VAMM).to.not.be.null;
    });

    it("Should set the correct reserves", async function () {
      const { VAMM } = await loadFixture(deployVAMMFixture);
      expect(await VAMM.read.tokenReserve()).to.equal(initialTokenReserve);
      expect(await VAMM.read.ethReserve()).to.equal(initialEthReserve);
    });
  });

  describe("Position Operations", function () {
    it("Should open a long position correctly", async function () {
      const { VAMM, MockUSDC, otherAccount, TokenVault } = await loadFixture(deployVAMMFixture);

      await MockUSDC.write.mint([otherAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: otherAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: otherAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve, true], { account: otherAccount.account.address }); // add token to be 2x of the initial reserve

      // Reverves should follow x => 2x then y => 1/2x rule from x * y = k curve
      expect(await VAMM.read.totalReserve()).to.equal( initialTokenReserve * initialEthReserve);
      expect(await VAMM.read.tokenReserve()).to.equal( initialTokenReserve * BigInt(2));
      expect(await VAMM.read.ethReserve()).to.equal( initialEthReserve / BigInt(2));

      // User's 0th position should be long with half of the initial eth token reserve
      const positions = await VAMM.read.ethPositionsOf([otherAccount.account.address, BigInt(0)]);
      expect(positions[0]).to.equal(initialEthReserve / BigInt(2));
      expect(positions[1]).to.equal(true);

    });

    it("Should open a short position correctly", async function () {
      const { VAMM, MockUSDC, otherAccount, TokenVault } = await loadFixture(deployVAMMFixture);

      await MockUSDC.write.mint([otherAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: otherAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: otherAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve / BigInt(2), false], { account: otherAccount.account.address }); // sub token to be 1/2x of the initial reserve

      // Reverves should follow x => 1/2x then y => 2x rule from x * y = k curve
      expect(await VAMM.read.totalReserve()).to.equal( initialTokenReserve * initialEthReserve);
      expect(await VAMM.read.tokenReserve()).to.equal( initialTokenReserve / BigInt(2));
      expect(await VAMM.read.ethReserve()).to.equal( initialEthReserve * BigInt(2));

      // User's 0th position should be long with half of the initial eth token reserve
      const positions = await VAMM.read.ethPositionsOf([otherAccount.account.address, BigInt(0)]);
      expect(positions[0]).to.equal(initialEthReserve);
      expect(positions[1]).to.equal(false);
    });

    it("Should fully close a position correctly", async function () {
      const { VAMM, MockUSDC, otherAccount, TokenVault } = await loadFixture(deployVAMMFixture);
      
      await MockUSDC.write.mint([otherAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: otherAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: otherAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve, true], { account: otherAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve * BigInt(2), true], { account: otherAccount.account.address }); // add another position to occupy the array
      expect(await TokenVault.read.virtualBalanceOf([otherAccount.account.address])).to.equal(initialTokenReserve * BigInt(7));

      expect((await VAMM.read.ethPositionsOf([otherAccount.account.address, BigInt(1)]))[0]).to.equals(initialEthReserve / BigInt(4));
      await VAMM.write.closePosition([0], { account: otherAccount.account.address });
      expect((await VAMM.read.ethPositionsOf([otherAccount.account.address, BigInt(0)]))[0]).to.equals(initialEthReserve / BigInt(4));
      await VAMM.write.closePosition([0], { account: otherAccount.account.address });
      expect(await TokenVault.read.virtualBalanceOf([otherAccount.account.address])).to.equal(initialTokenReserve * BigInt(10));
    });

    it("Should revert open position if amount is zero", async function () {
      const { VAMM, otherAccount } = await loadFixture(deployVAMMFixture);
      await expect(VAMM.write.openPosition([BigInt(0), true], { account: otherAccount.account.address })).to.be.rejectedWith("Open position amount must not be 0");
    });

    it("Should revert open position if insufficient collateral", async function () {
      const { VAMM, otherAccount } = await loadFixture(deployVAMMFixture);
      await expect(VAMM.write.openPosition([initialTokenFund * BigInt(1000), true], { account: otherAccount.account.address })).to.be.rejectedWith("Insufficient Collateral");
    });

    it("Should revert close position if index is invalid", async function () {
      const { VAMM, otherAccount } = await loadFixture(deployVAMMFixture);
      await expect(VAMM.write.closePosition([0], { account: otherAccount.account.address })).to.be.rejectedWith("Invalid position index");
    });
  });
});