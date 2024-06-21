// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../Utils.sol';

contract UtilsWrapper is Utils {
    function uintDiffAbsWrapper(uint256 _a, uint256 _b) public pure returns (uint256) {
        return uintDiffAbs(_a, _b);
    }
}