import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

import { initialTokenReserve, initialEthReserve, initialTokenFund } from "./constants";

describe("vAMM contract", function () {
  async function deployVAMMFixture() {
    const [owner, userAccount] = await hre.viem.getWalletClients();

    const MockUSDC = await hre.viem.deployContract("MockERC20", ["Mock USDC", "MUSDC"]);
    await MockUSDC.write.mint([userAccount.account.address, initialTokenFund]);

    const TokenVault = await hre.viem.deployContract("TokenVault", [MockUSDC.address]);

    const VAMM = await hre.viem.deployContract("vAMM", [
      TokenVault.address,
      MockUSDC.address,
      initialTokenReserve,
      initialEthReserve,
    ]);

    await TokenVault.write.setAMMAddress([VAMM.address]);

    return { VAMM, TokenVault, MockUSDC, owner, userAccount };
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
      const { VAMM, MockUSDC, userAccount, TokenVault } = await loadFixture(deployVAMMFixture);

      await MockUSDC.write.mint([userAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: userAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: userAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve, true], { account: userAccount.account.address }); // add token to be 2x of the initial reserve

      // Reverves should follow x => 2x then y => 1/2x rule from x * y = k curve
      expect(await VAMM.read.totalReserve()).to.equal(initialTokenReserve * initialEthReserve);
      expect(await VAMM.read.tokenReserve()).to.equal(initialTokenReserve * BigInt(2));
      expect(await VAMM.read.ethReserve()).to.equal(initialEthReserve / BigInt(2));

      // User's 0th position should be long with half of the initial eth token reserve
      const positions = await VAMM.read.ethPositionsOf([userAccount.account.address, BigInt(0)]);
      expect(positions[0]).to.equal(initialEthReserve / BigInt(2));
      expect(positions[1]).to.equal(true);
    });

    it("Should open a short position correctly", async function () {
      const { VAMM, MockUSDC, userAccount, TokenVault } = await loadFixture(deployVAMMFixture);

      await MockUSDC.write.mint([userAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: userAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: userAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve / BigInt(2), false], { account: userAccount.account.address }); // sub token to be 1/2x of the initial reserve

      // Reverves should follow x => 1/2x then y => 2x rule from x * y = k curve
      expect(await VAMM.read.totalReserve()).to.equal(initialTokenReserve * initialEthReserve);
      expect(await VAMM.read.tokenReserve()).to.equal(initialTokenReserve / BigInt(2));
      expect(await VAMM.read.ethReserve()).to.equal(initialEthReserve * BigInt(2));

      // User's 0th position should be long with half of the initial eth token reserve
      const positions = await VAMM.read.ethPositionsOf([userAccount.account.address, BigInt(0)]);
      expect(positions[0]).to.equal(initialEthReserve);
      expect(positions[1]).to.equal(false);
    });

    it("Should fully close a position correctly", async function () {
      const { VAMM, MockUSDC, userAccount, TokenVault } = await loadFixture(deployVAMMFixture);

      await MockUSDC.write.mint([userAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: userAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: userAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve, true], { account: userAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve * BigInt(2), true], { account: userAccount.account.address }); // add another position to occupy the array
      expect(await TokenVault.read.virtualBalanceOf([userAccount.account.address])).to.equal(initialTokenReserve * BigInt(7));

      expect((await VAMM.read.ethPositionsOf([userAccount.account.address, BigInt(1)]))[0]).to.equals(initialEthReserve / BigInt(4));
      await VAMM.write.closePosition([0], { account: userAccount.account.address });
      expect((await VAMM.read.ethPositionsOf([userAccount.account.address, BigInt(0)]))[0]).to.equals(initialEthReserve / BigInt(4));
      await VAMM.write.closePosition([0], { account: userAccount.account.address });
      expect(await TokenVault.read.virtualBalanceOf([userAccount.account.address])).to.equal(initialTokenReserve * BigInt(10));
    });

    it("Should revert open position if amount is zero", async function () {
      const { VAMM, userAccount } = await loadFixture(deployVAMMFixture);
      await expect(VAMM.write.openPosition([BigInt(0), true], { account: userAccount.account.address })).to.be.rejectedWith("Open position amount must not be 0");
    });

    it("Should revert open position if insufficient collateral", async function () {
      const { VAMM, userAccount } = await loadFixture(deployVAMMFixture);
      await expect(VAMM.write.openPosition([initialTokenFund * BigInt(1000), true], { account: userAccount.account.address })).to.be.rejectedWith("Insufficient Collateral");
    });

    it("Should revert close position if index is invalid", async function () {
      const { VAMM, userAccount } = await loadFixture(deployVAMMFixture);
      await expect(VAMM.write.closePosition([0], { account: userAccount.account.address })).to.be.rejectedWith("Invalid position index");
    });
  });

  describe("Emit Evnets", function () {
    it("Should emit PositionOpenedEvent and PositionClosedEvent event correctly", async function () {
      const { TokenVault, MockUSDC, VAMM, userAccount } = await loadFixture(deployVAMMFixture);

      await MockUSDC.write.mint([userAccount.account.address, initialTokenReserve]);
      await MockUSDC.write.approve([TokenVault.address, initialTokenReserve], { account: userAccount.account.address });
      await TokenVault.write.depositToken([initialTokenReserve], { account: userAccount.account.address });
      await VAMM.write.openPosition([initialTokenReserve, true], { account: userAccount.account.address });
      const positionOpenedEvent = await (await hre.viem.getPublicClient()).getContractEvents({
        address: VAMM.address as `0x${string}`,
        abi: VAMM.abi,
        eventName: "PositionOpenedEvent",
        args: {
          user: userAccount.account.address,
        }
      });

      await expect(positionOpenedEvent[0]).to.be.not.null;
      await expect(positionOpenedEvent[0].address).to.be.equal(VAMM.address);
      await expect(positionOpenedEvent[0].args.user?.toLowerCase()).to.be.equal(userAccount.account.address);
      await expect(positionOpenedEvent[0].args.isLong).to.be.equal(true);
      await expect(positionOpenedEvent[0].args.ethAmount).to.be.equal(initialEthReserve / BigInt(2));

      await VAMM.write.closePosition([0], { account: userAccount.account.address });
      const positionCLosedEvent = await (await hre.viem.getPublicClient()).getContractEvents({
        address: VAMM.address as `0x${string}`,
        abi: VAMM.abi,
        eventName: "PositionClosedEvent",
        args: {
          user: userAccount.account.address,
        }
      });

      await expect(positionCLosedEvent[0]).to.be.not.null;
      await expect(positionCLosedEvent[0].address).to.be.equal(VAMM.address);
      await expect(positionOpenedEvent[0].args.user?.toLowerCase()).to.be.equal(userAccount.account.address);
      await expect(positionOpenedEvent[0].args.isLong).to.be.equal(true);
      await expect(positionOpenedEvent[0].args.ethAmount).to.be.equal(initialEthReserve / BigInt(2));
    });
  });
});