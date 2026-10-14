import type { Chain } from "viem";
import { foundry, baseSepolia, base } from "viem/chains";
export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
export const chain: Chain = [foundry, baseSepolia, base].find(c => c.id === chainId) ?? foundry;
export const rpc = process.env.NEXT_PUBLIC_RPC ?? "http://127.0.0.1:8545";
export const contractAddress = process.env.NEXT_PUBLIC_CHAINBRIEF as `0x${string}`;
export const tokenAddress = process.env.NEXT_PUBLIC_USDC as `0x${string}`;
