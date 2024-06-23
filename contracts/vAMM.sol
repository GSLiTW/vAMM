// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Utils.sol";
import "./TokenVault.sol";

struct Position {
    uint256 amount;
    bool isLong;
}

event PositionOpenedEvent(address indexed user, bool isLong, uint256 ethAmount);
event PositionClosedEvent(address indexed user, bool isLong, uint256 ethAmount);

contract vAMM is Utils {
    using Math for uint256;

    IERC20 public immutable token;
    TokenVault public immutable vault;
    uint256 public immutable totalReserve; // constant AMM curve: x * y = k
    uint256 public tokenReserve;
    uint256 public ethReserve;
    mapping(address => Position[]) public ethPositionsOf;

    constructor(address _vaultContract, address _tokenContract, uint256 _initialTokenReserve, uint256 _initialEthReserve) {
        token = IERC20(_tokenContract);
        vault = TokenVault(_vaultContract);
        tokenReserve = _initialTokenReserve;
        ethReserve = _initialEthReserve;
        (bool overflowsMul, uint256 resultMul) = _initialTokenReserve.tryMul(_initialEthReserve);
        require(overflowsMul, 'Mul overflow');
        totalReserve = resultMul;
    }

    // _virtualAmount is the amount of virtual tokens
    function openPosition(uint256 _virtualAmount, bool _isLong) external {
        require(_virtualAmount > 0, "Open position amount must not be 0");
        if(!vault.openPosition(_virtualAmount, msg.sender)) revert("Insufficient Collateral");

        if (_isLong) {
            (bool overflowsAdd, uint256 resultAdd) = tokenReserve.tryAdd(_virtualAmount);
            require(overflowsAdd, 'Add overflow');
            tokenReserve = resultAdd;
        } else {
            (bool overflowsSub, uint256 resultSub) = tokenReserve.trySub(_virtualAmount);
            require(overflowsSub, 'Sub overflow');
            tokenReserve = resultSub;
        }

        uint256 oldEthReserve = ethReserve;
        (bool overflowsDiv, uint256 resultDiv) = totalReserve.tryDiv(tokenReserve);
        require(overflowsDiv, 'Div overflow');
        ethReserve = resultDiv;

        ethPositionsOf[msg.sender].push(Position({
            amount: uintDiffAbs(oldEthReserve, ethReserve),
            isLong: _isLong
        }));

        emit PositionOpenedEvent(msg.sender, _isLong, uintDiffAbs(oldEthReserve, ethReserve));
    }

    function closePosition(uint8 _positionIndex) external {
        require(_positionIndex < ethPositionsOf[msg.sender].length, "Invalid position index");

        Position storage position = ethPositionsOf[msg.sender][_positionIndex];
        
        if (position.isLong) {
            (bool overflowsAdd, uint256 resultAdd) = ethReserve.tryAdd(position.amount);
            require(overflowsAdd, 'Add overflow');
            ethReserve = resultAdd;
        } else {
            (bool overflowsSub, uint256 resultSub) = ethReserve.trySub(position.amount);
            require(overflowsSub, 'Sub overflow');
            ethReserve = resultSub;
        }

        uint256 oldTokenReserve = tokenReserve;
        (bool overflowsDiv, uint256 resultDiv) = totalReserve.tryDiv(ethReserve);
        require(overflowsDiv, 'Div overflow');
        tokenReserve = resultDiv;
        uint256 tokenExchangeAmount = uintDiffAbs(oldTokenReserve, tokenReserve);

        vault.closePosition(tokenExchangeAmount, msg.sender);
        removePosition(msg.sender, _positionIndex);

        emit PositionClosedEvent(msg.sender, position.isLong, position.amount);
    }

    function removePosition(address user, uint8 index) internal {
        require(index < ethPositionsOf[user].length, "Invalid index");
        uint256 lastIndex = ethPositionsOf[user].length - 1;
        if (index != lastIndex) {
            ethPositionsOf[user][index] = ethPositionsOf[user][lastIndex];
        }
        ethPositionsOf[user].pop();
    }

    // query the rate from token to eth
    function getWorthOfEth(uint256 _tokenPayment, uint8 _leverage, bool _isLong) external view returns (uint256) {
        uint256 tokenPayment = _tokenPayment * _leverage;
        uint256 newTokenReserve = _isLong ? tokenReserve + tokenPayment : tokenReserve - tokenPayment;
        uint256 newEthReserve = totalReserve / newTokenReserve;
        return uintDiffAbs(ethReserve, newEthReserve);
    }

    // query the rate from eth to token
    function getTokenPayment(uint256 _ethAmount, uint8 _leverage, bool _isLong) external view returns (uint256) {
        uint256 newEthReserve = _isLong ? ethReserve - _ethAmount : ethReserve + _ethAmount;
        uint256 newTokenReserve = totalReserve / newEthReserve;
        return uintDiffAbs(tokenReserve, newTokenReserve) / _leverage;
    }
}