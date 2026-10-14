import { parseAbi } from "viem";

export const chainBriefAbi = parseAbi([
  "function subscribe(uint8 topicCount)",
  "function charge(address user)",
  "function cancel()",
  "function isActive(address user) view returns (bool)",
  "function subs(address) view returns (uint8 topicCount, uint40 nextCharge, bool active)",
  "function usdc() view returns (address)",
  "function weeklyAmount(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function pricePerTopic() view returns (uint256)",
  "event Subscribed(address indexed user, uint8 topicCount)",
  "event Charged(address indexed user, uint256 amount, uint40 nextCharge)",
  "event Cancelled(address indexed user)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);
