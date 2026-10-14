import fs from "node:fs";
import {createPublicClient,createWalletClient,http} from "viem";
import {foundry} from "viem/chains";
async function main() {
  const transport=http("http://127.0.0.1:8545");
  const client=createPublicClient({chain:foundry,transport});
  if(await client.getChainId()!==31337) throw new Error("Local deployment requires Anvil chain ID 31337.");
  // Uses Anvil's unlocked public test account. No private key is accepted by this script.
  const wallet=createWalletClient({chain:foundry,transport,account:"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"});
  const transactions:{contractName:string;transactionType:string;contractAddress:string}[]=[];
  for(const name of ["MockUSDC","ChainBrief"]) {
    const file=`../contracts/out/${name}.sol/${name}.json`;
    if(!fs.existsSync(file)) throw new Error("Compile first: cd ../contracts && npm ci && forge build");
    const artifact=JSON.parse(fs.readFileSync(file,"utf8"));
    const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args:name==="ChainBrief"?[transactions[0].contractAddress]:[]});
    const receipt=await client.waitForTransactionReceipt({hash});
    if(receipt.status!=="success" || !receipt.contractAddress) throw new Error(`${name} deployment failed.`);
    transactions.push({contractName:name,transactionType:"CREATE",contractAddress:receipt.contractAddress});
    console.log(`${name}: ${receipt.contractAddress}`);
  }
  fs.mkdirSync("../contracts/broadcast/Deploy.s.sol/31337",{recursive:true});
  fs.writeFileSync("../contracts/broadcast/Deploy.s.sol/31337/run-latest.json",JSON.stringify({transactions},null,2));
  // sync-local preserves server credentials while refreshing only public local addresses.
  await import("./sync-local");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
