// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Utils.sol";

event DepositTokenEvent(address indexed user, uint256 depositTokenAmount);
event WithdrawTokenEvent(address indexed user, uint256 withdrawTokenAmount);
event SetAMMAddressEvent(address indexed previousAMM, address indexed newAMM);

contract TokenVault is Utils, ReentrancyGuard, Ownable {
    IERC20 public immutable token;
    address public ammAddress;
    mapping(address => uint256) public virtualBalanceOf; // _virtualAmount is the amount of virtual tokens

    modifier onlyAMM() {
        require(msg.sender == ammAddress, "Only AMM can call this function");
        _;
    }

    constructor(address tokenContract_) Ownable(msg.sender) {
        token = IERC20(tokenContract_);
    }

    function setAMMAddress(address newAMMAddress) external onlyOwner {
        require(newAMMAddress != address(0), "AMM address cannot be zero");
        address previousAMM = ammAddress;
        ammAddress = newAMMAddress;
        emit SetAMMAddressEvent(previousAMM, newAMMAddress);
    }

    function depositToken(uint256 _amount) external {
        require(_amount > 0, "Deposit Amount must be greater than 0");

        bool success = token.transferFrom(msg.sender, address(this), _amount);
        require(success, "Deposit token transfer failed");

        virtualBalanceOf[msg.sender] += _amount * MAX_LEVERAGE;

        emit DepositTokenEvent(msg.sender, _amount);
    }

    function withdrawToken(uint256 _amount) external nonReentrant {
        // if virtualOnChainAmount is less than MAX_LEVERAGE, the requested amount is less than a single token
        require(
            virtualBalanceOf[msg.sender] >= _amount * MAX_LEVERAGE,
            "Insufficient balance"
        );
        require(
            token.balanceOf(address(this)) >= _amount,
            "Insufficient reserve in the Vault contract"
        );

        // Checks-Effects-Interactions
        virtualBalanceOf[msg.sender] -= _amount * MAX_LEVERAGE;

        bool success = token.transfer(msg.sender, _amount);
        require(success, "Withdraw token transfer failed");

        emit WithdrawTokenEvent(msg.sender, _amount);
    }

    function openPosition(
        uint256 _virtualAmount,
        address _userAddress
    ) external onlyAMM returns (bool) {
        if (virtualBalanceOf[_userAddress] < _virtualAmount) {
            return false;
        } else {
            virtualBalanceOf[_userAddress] -= _virtualAmount;
            return true;
        }
    }

    function closePosition(
        uint256 _virtualAmount,
        address _userAddress
    ) external onlyAMM {
        virtualBalanceOf[_userAddress] += _virtualAmount;
    }

    function getAccountValue(address _userAddress) external view returns (uint256) {
        return virtualBalanceOf[_userAddress];
    }
}