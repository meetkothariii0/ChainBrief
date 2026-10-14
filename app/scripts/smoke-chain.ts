import {spawn} from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import {createPublicClient,createWalletClient,http} from "viem";
import {foundry} from "viem/chains";
import {chainBriefAbi,erc20Abi} from "../lib/abi";
async function main() {
  const child=spawn("anvil",["--port","18545","--silent"],{stdio:"ignore"});
  let startupError:Error|undefined;child.on("error",e=>{startupError=e;});
  const client=createPublicClient({chain:foundry,transport:http("http://127.0.0.1:18545",{retryCount:0})});
  const owner="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const user="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const wallet=createWalletClient({chain:foundry,transport:http("http://127.0.0.1:18545"),account:user});
  const deployer=createWalletClient({chain:foundry,transport:http("http://127.0.0.1:18545"),account:owner});
  try {
    for(let tries=0;;tries++) {if(startupError)throw startupError;try{await client.getChainId();break;}catch(e){if(tries>50)throw e;await new Promise(r=>setTimeout(r,100));}}
    async function deploy(name:string,args:unknown[]=[]) {
      const file=`../contracts/out/${name}.sol/${name}.json`;
      if(!fs.existsSync(file))throw new Error("Run forge build in contracts first.");
      const artifact=JSON.parse(fs.readFileSync(file,"utf8"));
      const receipt=await client.waitForTransactionReceipt({hash:await deployer.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args})});
      assert.equal(receipt.status,"success");assert.ok(receipt.contractAddress);return receipt.contractAddress;
    }
    const usdc=await deploy("MockUSDC"),cb=await deploy("ChainBrief",[usdc]);
    const wait=async(hash:`0x${string}`)=>assert.equal((await client.waitForTransactionReceipt({hash})).status,"success");
    await wait(await wallet.writeContract({address:usdc,abi:erc20Abi,functionName:"mint",args:[user,100_000_000n]}));
    await wait(await wallet.writeContract({address:usdc,abi:erc20Abi,functionName:"approve",args:[cb,8_000_000n]}));
    await wait(await wallet.writeContract({address:cb,abi:chainBriefAbi,functionName:"subscribe",args:[2]}));
    assert.equal(await client.readContract({address:usdc,abi:erc20Abi,functionName:"balanceOf",args:[cb]}),2_000_000n);
    await assert.rejects(client.simulateContract({account:user,address:cb,abi:chainBriefAbi,functionName:"charge",args:[user]}));
    await client.request({method:"evm_increaseTime" as never,params:[604800] as never});await client.request({method:"evm_mine" as never});
    await wait(await wallet.writeContract({address:cb,abi:chainBriefAbi,functionName:"charge",args:[user]}));
    assert.equal(await client.readContract({address:usdc,abi:erc20Abi,functionName:"balanceOf",args:[cb]}),4_000_000n);
    await wait(await wallet.writeContract({address:cb,abi:chainBriefAbi,functionName:"cancel"}));
    assert.equal(await client.readContract({address:cb,abi:chainBriefAbi,functionName:"isActive",args:[user]}),true);
    await client.request({method:"evm_increaseTime" as never,params:[604800] as never});await client.request({method:"evm_mine" as never});
    await assert.rejects(client.simulateContract({account:user,address:cb,abi:chainBriefAbi,functionName:"charge",args:[user]}));
    assert.equal(await client.readContract({address:cb,abi:chainBriefAbi,functionName:"isActive",args:[user]}),false);
    console.log("PASS: local deployment, mint, approve, subscribe, weekly renewal, cancellation and expiry.");
  } finally {child.kill("SIGTERM");}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
