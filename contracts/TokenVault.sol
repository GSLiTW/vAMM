// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Utils.sol";
import "./vAMM.sol";

contract TokenVault is Utils, ReentrancyGuard {
    modifier onlyAMM() {
        require(msg.sender == address(amm), "Only AMM can call this function");
        _;
    }

    IERC20 public token;
    vAMM public amm;
    mapping(address => uint256) public virtualBalanceOf;
    

    constructor(address _tokenContract, uint256 _initialTokenReserve, uint256 _initialEthReserve) {
        token = IERC20(_tokenContract);
        amm = new vAMM(address(this), _tokenContract, _initialTokenReserve, _initialEthReserve);
    }

    // virtualOnChainAmount = amount * (10 ^ 18) * MAX_LEVERAGE, and this conversion should be done off-chain to save gas
    function depositToken(uint256 virtualOnChainAmount) external {
        require(virtualOnChainAmount > 0, "Amount must be greater than 0");

        token.transferFrom(msg.sender, address(this), virtualOnChainAmount);
        virtualBalanceOf[msg.sender] += virtualOnChainAmount;
    }

    // VirtualAmount calculation is done off-chain to save gas
    function withdrawToken(uint256 virtualOnChainAmount) external nonReentrant {
        // if virtualOnChainAmount is less than MAX_LEVERAGE, the requested amount is less than a single token
        require(virtualOnChainAmount >= MAX_LEVERAGE, "Withdraw amount must be greater than 0");
        require(virtualBalanceOf[msg.sender] >= virtualOnChainAmount, "Insufficient balance"); 
        require(token.balanceOf(address(this)) * MAX_LEVERAGE >= virtualOnChainAmount, "Insufficient reserve in the Vault contract");

        // Checks-Effects-Interactions
        virtualBalanceOf[msg.sender] -= virtualOnChainAmount;

        // Use division due to withdrawal is likely a less frequent operation. And I would like to save on-chain storage space.
        token.transfer(msg.sender, virtualOnChainAmount / MAX_LEVERAGE);
    }

    function openPosition(uint256 virtualOnChainAmount) external onlyAMM returns (bool){
        require(virtualBalanceOf[msg.sender] >= virtualOnChainAmount, "Insufficient balance");

        virtualBalanceOf[msg.sender] -= virtualOnChainAmount;

        return true;
    }

    function closePosition(uint256 virtualOnChainAmount) external onlyAMM returns (bool) {
        virtualBalanceOf[msg.sender] += virtualOnChainAmount;

        return true;
    }
}