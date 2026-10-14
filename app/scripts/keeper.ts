import {createWalletClient,http,parseAbiItem} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {chain,chainId} from "../lib/network";
import {publicClient,CHAINBRIEF,RPC,checkDeployment} from "../lib/chain";
import {chainBriefAbi} from "../lib/abi";
import {getState,setState} from "../lib/db";
import {runWorker} from "../lib/worker";
const localKey="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const key=process.env.KEEPER_PRIVATE_KEY || (chainId===31337?localKey:"");
if(!/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error("Set KEEPER_PRIVATE_KEY to a funded keeper wallet on this chain.");
if(chainId!==31337 && key===localKey) throw new Error("Never use public Anvil keys outside local development.");
const account=privateKeyToAccount(key as `0x${string}`);
const wallet=createWalletClient({account,chain,transport:http(RPC)});
const event=parseAbiItem("event Subscribed(address indexed user, uint8 topicCount)");
export async function tick() {
  await checkDeployment();
  const latest=await publicClient.getBlock();
  // Only finalized blocks outside Anvil. Scan bounded pages instead of one giant log request.
  const end=chainId===31337?latest.number:(await publicClient.getBlock({blockTag:"finalized"})).number;
  const namespace=`${chainId}:${CHAINBRIEF.toLowerCase()}`;
  let from=BigInt(getState(`cursor:${namespace}`)??process.env.DEPLOYMENT_BLOCK??"0");
  let registered=JSON.parse(getState(`subscribers:${namespace}`)??"[]") as `0x${string}`[];
  if(from>end+1n) {from=0n;registered=[];} // Anvil reset
  if(from<=end) {
    const to=from+499n<end?from+499n:end;
    const logs=await publicClient.getLogs({address:CHAINBRIEF,event,fromBlock:from,toBlock:to});
    registered=[...new Set([...registered,...logs.map(l=>l.args.user!).filter(Boolean)])];
    setState(`subscribers:${namespace}`,JSON.stringify(registered));setState(`cursor:${namespace}`,String(to+1n));
  }
  for(const user of registered) {
    if(Number(getState(`billing-retry:${namespace}:${user}`)??0)>Date.now()) continue;
    try {
      const [,due,active]=await publicClient.readContract({address:CHAINBRIEF,abi:chainBriefAbi,functionName:"subs",args:[user]});
      if(!active || latest.timestamp<BigInt(due)) continue;
      const {request}=await publicClient.simulateContract({account,address:CHAINBRIEF,abi:chainBriefAbi,functionName:"charge",args:[user]});
      const hash=await wallet.writeContract(request);
      const receipt=await publicClient.waitForTransactionReceipt({hash,confirmations:chainId===31337?1:2});
      if(receipt.status!=="success") throw new Error("Renewal reverted.");
      console.log(`Renewed ${user}: ${hash}`);
    } catch(e) {
      setState(`billing-retry:${namespace}:${user}`,String(Date.now()+300_000));
      console.error(`Renewal failed for ${user}. Will retry in five minutes.`,e instanceof Error?e.message:e);
    }
  }
}
runWorker("keeper",tick,10_000);
