// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script, console} from "forge-std/Script.sol";
import {ChainBrief} from "../src/ChainBrief.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        address token = vm.envOr("USDC_ADDRESS", address(0));
        require(token != address(0) || block.chainid == 31337, "set official USDC_ADDRESS outside Anvil");
        vm.startBroadcast();
        if (token == address(0)) token = address(new MockUSDC());
        ChainBrief cb = new ChainBrief(token);
        vm.stopBroadcast();
        console.log("USDC:", token);
        console.log("ChainBrief:", address(cb));
    }
}
