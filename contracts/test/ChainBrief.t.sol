// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {ChainBrief} from "../src/ChainBrief.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract ChainBriefTest is Test {
    MockUSDC usdc;
    ChainBrief cb;
    address alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        cb = new ChainBrief(address(usdc));
        usdc.mint(alice, 100e6);
        vm.prank(alice);
        usdc.approve(address(cb), 12e6); // 3 topics x 4 weeks
    }

    function _sub() internal { vm.prank(alice); cb.subscribe(3); }

    function test_SubscribeChargesFirstWeek() public {
        _sub();
        assertEq(usdc.balanceOf(address(cb)), 3e6);
        assertTrue(cb.isActive(alice));
    }

    function test_ChargeRevertsBeforeDue() public {
        _sub();
        vm.expectRevert("not due");
        cb.charge(alice);
    }

    function test_ChargeAfterOneWeek() public {
        _sub();
        vm.warp(block.timestamp + 7 days);
        cb.charge(alice);
        assertEq(usdc.balanceOf(address(cb)), 6e6);
    }

    function test_CancelStopsCharging() public {
        _sub();
        vm.prank(alice);
        cb.cancel();
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert("not due");
        cb.charge(alice);
        assertFalse(cb.isActive(alice)); // paid week is over, no grace after cancel
    }

    function test_ChargeRevertsWithoutAllowance() public {
        _sub();
        vm.prank(alice);
        usdc.approve(address(cb), 0);
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert();
        cb.charge(alice);
    }

    function test_PriceChangeDoesNotRaiseExistingFee() public {
        _sub(); cb.setPrice(2e6);
        vm.warp(block.timestamp + 7 days); cb.charge(alice);
        assertEq(cb.weeklyAmount(alice), 3e6);
        assertEq(usdc.balanceOf(address(cb)), 6e6);
    }
    function test_FailedRenewalPreservesDueDate() public {
        _sub(); (, uint40 due,) = cb.subs(alice);
        vm.prank(alice); usdc.approve(address(cb), 0);
        vm.warp(due); vm.expectRevert(); cb.charge(alice);
        (, uint40 afterDue,) = cb.subs(alice);
        assertEq(afterDue, due); assertFalse(cb.isActive(alice));
    }
    function test_DelayedKeeperDoesNotBackCharge() public {
        _sub(); vm.warp(block.timestamp + 28 days); cb.charge(alice);
        assertEq(usdc.balanceOf(address(cb)), 6e6);
        vm.expectRevert("not due"); cb.charge(alice);
    }
    function test_CancellationKeepsPaidAccess() public {
        _sub(); vm.prank(alice); cb.cancel(); assertTrue(cb.isActive(alice));
        vm.prank(alice); vm.expectRevert("paid period remains"); cb.subscribe(3);
        vm.warp(block.timestamp + 7 days); vm.prank(alice); cb.subscribe(3);
        assertTrue(cb.isActive(alice));
    }
    function test_PauseStillAllowsCancellation() public {
        _sub(); cb.pause(); vm.warp(block.timestamp + 7 days);
        vm.expectRevert(); cb.charge(alice);
        vm.prank(alice); cb.cancel();
    }
    function test_WithdrawOnlyOwner() public {
        _sub(); vm.prank(alice); vm.expectRevert(); cb.withdraw(alice, 3e6);
        cb.withdraw(address(this), 3e6); assertEq(usdc.balanceOf(address(this)), 3e6);
    }
    function test_InsufficientBalancePreservesState() public {
        _sub(); vm.prank(alice); usdc.transfer(address(0xB0B), 97e6);
        vm.warp(block.timestamp + 7 days); vm.expectRevert(); cb.charge(alice);
        assertFalse(cb.isActive(alice));
    }
    function test_DuplicateSubscriptionRejected() public {
        _sub(); vm.prank(alice); vm.expectRevert("already active"); cb.subscribe(3);
    }
    function testFuzz_InvalidTopicCount(uint8 count) public {
        vm.assume(count == 0 || count > 20);
        vm.prank(alice); vm.expectRevert("bad topic count"); cb.subscribe(count);
    }
}
