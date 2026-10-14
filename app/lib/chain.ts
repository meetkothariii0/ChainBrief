import { createPublicClient, http, isAddress } from "viem";
import { chain, chainId, rpc, contractAddress, tokenAddress } from "./network";
import { chainBriefAbi } from "./abi";
export const RPC = process.env.RPC_URL || rpc;
export const CHAINBRIEF = contractAddress;
export const publicClient = createPublicClient({ chain, transport: http(RPC) });
class DeploymentError extends Error {}
export async function checkDeployment() {
  try {
  if (chain.id !== chainId) throw new DeploymentError("Unsupported chain ID. Use 31337, 84532 or 8453.");
  if (!isAddress(CHAINBRIEF ?? "") || !isAddress(tokenAddress ?? ""))
    throw new DeploymentError("Contract addresses missing. Run npm run sync:local after deployment and restart Next.js.");
  if (await publicClient.getChainId() !== chainId) throw new DeploymentError("RPC chain ID differs from app configuration.");
  const codes = await Promise.all([CHAINBRIEF, tokenAddress].map(address => publicClient.getCode({ address })));
  if (codes.some(code => !code || code === "0x"))
    throw new DeploymentError("No contract at configured addresses. Redeploy after restarting Anvil, sync addresses and restart Next.js.");
  const token = await publicClient.readContract({address: CHAINBRIEF, abi: chainBriefAbi, functionName: "usdc"});
  if (token.toLowerCase() !== tokenAddress.toLowerCase()) throw new DeploymentError("USDC address does not match the subscription contract.");
  } catch(e) {if(e instanceof DeploymentError) throw e;throw new DeploymentError("Cannot read the configured RPC. Keep Anvil running locally, or check your RPC settings.");}
}
export async function isActive(user: `0x${string}`) {
  try {return await publicClient.readContract({address:CHAINBRIEF,abi:chainBriefAbi,functionName:"isActive",args:[user]});}
  catch {throw new Error("Subscription status unavailable. Check the server RPC and deployed contract.");}
}
