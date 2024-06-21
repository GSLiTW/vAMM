// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

contract Utils {
    using Math for uint256;

    uint8 public constant MAX_LEVERAGE = 10;
    
    function uintDiffAbs(uint256 _a, uint256 _b) internal pure returns (uint256) {
        if(_a >= _b){
            (bool overflowsSub, uint256 resultSub) = _a.trySub(_b);
            require(overflowsSub, 'Sub overflow');
            return resultSub;
        }
        else{
            (bool overflowsSub, uint256 resultSub) = _b.trySub(_a);
            require(overflowsSub, 'Sub overflow');
            return resultSub;
        }
    }
}