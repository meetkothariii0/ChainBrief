// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice USDC subscriptions. An external keeper submits renewal transactions.
/// @dev Existing subscribers keep their agreed weekly fee when the public price changes.
contract ChainBrief is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdc;
    uint256 public constant PERIOD = 7 days;
    uint256 public pricePerTopic = 1e6;
    struct Sub { uint8 topicCount; uint40 nextCharge; bool active; }
    mapping(address => Sub) public subs;
    mapping(address => uint256) public weeklyAmount;

    event Subscribed(address indexed user, uint8 topicCount);
    event Charged(address indexed user, uint256 amount, uint40 nextCharge);
    event Cancelled(address indexed user);
    event PriceChanged(uint256 oldPrice, uint256 newPrice);
    event Withdrawal(address indexed to, uint256 amount);

    constructor(address token) Ownable(msg.sender) {
        require(token != address(0) && token.code.length > 0, "invalid token");
        require(IERC20Metadata(token).decimals() == 6, "token must use 6 decimals");
        usdc = IERC20(token);
    }

    function subscribe(uint8 topicCount) external nonReentrant whenNotPaused {
        require(topicCount > 0 && topicCount <= 20, "bad topic count");
        require(!subs[msg.sender].active, "already active");
        require(block.timestamp >= subs[msg.sender].nextCharge, "paid period remains");
        uint256 amount = pricePerTopic * topicCount;
        uint40 paidUntil = uint40(block.timestamp + PERIOD);
        subs[msg.sender] = Sub(topicCount, paidUntil, true);
        weeklyAmount[msg.sender] = amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Subscribed(msg.sender, topicCount);
        emit Charged(msg.sender, amount, paidUntil);
    }

    /// @notice Permissionless renewal, at most once per paid period. No catch-up billing.
    function charge(address user) external nonReentrant whenNotPaused {
        Sub storage s = subs[user];
        require(s.active && block.timestamp >= s.nextCharge, "not due");
        uint256 amount = weeklyAmount[user];
        s.nextCharge = uint40(block.timestamp + PERIOD);
        usdc.safeTransferFrom(user, address(this), amount);
        emit Charged(user, amount, s.nextCharge);
    }

    function cancel() external nonReentrant {
        require(subs[msg.sender].active, "already cancelled");
        subs[msg.sender].active = false;
        emit Cancelled(msg.sender);
    }

    /// @notice Cancellation preserves paid access; failed renewals never grant unpaid access.
    function isActive(address user) external view returns (bool) {
        return block.timestamp < subs[user].nextCharge;
    }

    function setPrice(uint256 price) external onlyOwner {
        require(price > 0 && price <= 100e6, "bad price");
        emit PriceChanged(pricePerTopic, price);
        pricePerTopic = price;
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "invalid recipient");
        usdc.safeTransfer(to, amount);
        emit Withdrawal(to, amount);
    }
}
