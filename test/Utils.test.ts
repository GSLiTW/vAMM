import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("Utils", function () {
    async function deployUtilsFixture() {
        const utils = await hre.viem.deployContract("UtilsWrapper", []);

        return { utils };
    };

    describe("Deployment", function () {
        it("Should deploy the Utils contract", async function () {
            const { utils } = await loadFixture(deployUtilsFixture);
            expect(utils).to.not.be.null;
        });
    });

    describe("MAX_LEVERAGE", function () {
        it("Should return the correct MAX_LEVERAGE value", async function () {
            const { utils } = await loadFixture(deployUtilsFixture);
            const maxLeverage = await utils.read.MAX_LEVERAGE();
            expect(maxLeverage).to.equal(10);
        });
    });

    describe("uintDiffAbs", function () {
        it("Should return the correct absolute difference when a > b", async function () {
            const { utils } = await loadFixture(deployUtilsFixture);
            const result = await utils.read.uintDiffAbsWrapper([BigInt(10), BigInt(5)]);
            expect(result).to.equal(BigInt(5));
        });

        it("Should return the correct absolute difference when a < b", async function () {
            const { utils } = await loadFixture(deployUtilsFixture);
            const result = await utils.read.uintDiffAbsWrapper([BigInt(5), BigInt(10)]);
            expect(result).to.equal(BigInt(5));
        });

        it("Should return 0 when a == b", async function () {
            const { utils } = await loadFixture(deployUtilsFixture);
            const result = await utils.read.uintDiffAbsWrapper([BigInt(7), BigInt(7)]);
            expect(result).to.equal(BigInt(0));
        });

        it("Should handle large numbers correctly", async function () {
            const { utils } = await loadFixture(deployUtilsFixture);
            const a = BigInt("1000000000000000000000000");
            const b = BigInt("999999999999999999999999");
            const result = await utils.read.uintDiffAbsWrapper([a, b]);
            expect(result).to.equal(BigInt(1));
        });
    });
});