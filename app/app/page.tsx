"use client";
import {useState} from "react";
import {useAccount,useConnect,useDisconnect,useReadContract,useWriteContract,useSignMessage,useConfig,useSwitchChain} from "wagmi";
import {waitForTransactionReceipt,getPublicClient} from "wagmi/actions";
import {formatUnits,isAddress,parseUnits} from "viem";
import {chainBriefAbi,erc20Abi} from "@/lib/abi";
import {chain,chainId,contractAddress as CB,tokenAddress as USDC} from "@/lib/network";
import {validatePrefs} from "@/lib/message";

function errorText(e:unknown) {
  const value=e as {shortMessage?:string;message?:string;details?:string};
  return [value.shortMessage??value.message??"Operation failed.",value.details].filter(Boolean).join(" ");
}
async function api(path:string,body?:unknown) {
  const response=await fetch(path,body===undefined?{cache:"no-store"}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok) throw new Error(result.error??"Request failed.");return result;
}
export default function Home() {
  const config=useConfig();
  const {address,isConnected,chainId:walletChain}=useAccount();
  const {connectors,connectAsync}=useConnect();
  const {disconnect}=useDisconnect();
  const {switchChainAsync}=useSwitchChain();
  const {writeContractAsync}=useWriteContract();
  const {signMessageAsync}=useSignMessage();
  const [email,setEmail]=useState("");
  const [topicsText,setTopicsText]=useState("AI, Bengaluru FC");
  const [newsText,setNewsText]=useState("");
  const [symbol,setSymbol]=useState("");const [below,setBelow]=useState("");
  const [status,setStatus]=useState("");const [digest,setDigest]=useState("");
  const [busy,setBusy]=useState(false);const [signedIn,setSignedIn]=useState("");
  const [emailStatus,setEmailStatus]=useState("");
  const configured=isAddress(CB??"")&&isAddress(USDC??"");
  const query={enabled:!!address&&configured};
  const {data:sub,refetch:refetchSub}=useReadContract({chainId,address:CB,abi:chainBriefAbi,functionName:"subs",args:address?[address]:undefined,query});
  const {data:balance,refetch:refetchBalance}=useReadContract({chainId,address:USDC,abi:erc20Abi,functionName:"balanceOf",args:address?[address]:undefined,query});
  const {data:price}=useReadContract({chainId,address:CB,abi:chainBriefAbi,functionName:"pricePerTopic",query:{enabled:configured}});
  const {data:weeklyFee,refetch:refetchWeeklyFee}=useReadContract({chainId,address:CB,abi:chainBriefAbi,functionName:"weeklyAmount",args:address?[address]:undefined,query});
  const topics=topicsText.split(",").map(t=>t.trim()).filter(Boolean);
  const prefs=()=>validatePrefs({email,topics,newsAlerts:newsText.split(",").map(t=>t.trim()).filter(Boolean),alerts:symbol&&below?[{symbol:symbol.trim().toUpperCase(),below:Number(below)}]:[]});
  const wait=async(hash:`0x${string}`)=>{const receipt=await waitForTransactionReceipt(config,{chainId,hash});if(receipt.status!=="success") throw new Error("Transaction reverted. No operation completed.");};
  async function run(action:()=>Promise<void>) {if(busy)return;setBusy(true);try{await action();}catch(e){setStatus(errorText(e));}finally{setBusy(false);}}
  async function ready() {
    if(!address)throw new Error("Connect your wallet first.");
    if(chain.id!==chainId)throw new Error("Unsupported chain configuration.");
    if(!configured)throw new Error("Deploy the contracts, run npm run sync:local, then restart the website.");
    await api("/api/health");
    if(walletChain!==chainId){setStatus(`Switching wallet to ${chain.name}…`);await switchChainAsync({chainId});}
    const client=getPublicClient(config,{chainId});
    if(!client)throw new Error("RPC unavailable.");
    for(const target of [CB,USDC])if(!await client.getCode({address:target}))throw new Error("Browser RPC has no deployed contracts. Redeploy, sync addresses and restart.");
    return client;
  }
  async function signIn() {
    await ready();
    const proof=await api("/api/auth/challenge",{address});
    setStatus("Sign the wallet login message. It does not authorize a payment.");
    const signature=await signMessageAsync({message:proof.message});
    await api("/api/auth/verify",{nonce:proof.nonce,signature});setSignedIn(address!);
  }
  async function authenticated() {if(signedIn!==address)await signIn();}
  async function save() {
    const data=prefs();await authenticated();setStatus("Saving topics and email…");
    const result=await api("/api/subscribe",data);
    setStatus(result.verified?"Preferences saved. Your weekly briefing worker will use these topics.":result.emailSent?"Subscription successful. A confirmation email was sent; click its link to receive briefings.":"Preferences saved. The confirmation email is queued; keep the mail worker running to deliver it.");
  }
  async function connect() {
    if(!connectors[0])throw new Error("Install or enable a wallet browser extension first.");
    await connectAsync({connector:connectors[0],chainId});setStatus("Wallet connected. Check deployment before subscribing.");
  }
  async function faucet() {
    const client=await ready();if(chainId!==31337)throw new Error("Minting is available only on local Anvil. Use the official testnet faucet elsewhere.");
    setStatus("Confirm minting 100 mock USDC in your wallet…");
    const {request}=await client!.simulateContract({account:address,address:USDC,abi:erc20Abi,functionName:"mint",args:[address!,parseUnits("100",6)]});
    await wait(await writeContractAsync(request));await refetchBalance();setStatus("Received 100 local mock USDC.");
  }
  async function approve(amount:bigint) {
    setStatus(`Approve ${formatUnits(amount,6)} USDC total spending allowance…`);
    const client=await ready();
    const {request}=await client!.simulateContract({account:address,address:USDC,abi:erc20Abi,functionName:"approve",args:[CB,amount]});
    await wait(await writeContractAsync(request));
  }
  async function replenish() {
    const client=await ready();
    const fee=await client!.readContract({address:CB,abi:chainBriefAbi,functionName:"weeklyAmount",args:[address!]});
    if(fee===0n)throw new Error("No subscription fee found. Subscribe first.");
    await approve(fee*4n);setStatus("Allowance replenished for four renewals.");
  }
  async function subscribe() {
    const data=prefs(),client=await ready();
    const currentPrice=await client!.readContract({address:CB,abi:chainBriefAbi,functionName:"pricePerTopic"});
    if((balance??0n)<currentPrice*BigInt(data.topics.length))throw new Error("Insufficient USDC for the first week.");
    await approve(currentPrice*BigInt(data.topics.length)*4n);
    setStatus("Confirm the first weekly payment and subscription…");
    const {request}=await client!.simulateContract({account:address,address:CB,abi:chainBriefAbi,functionName:"subscribe",args:[data.topics.length]});
    await wait(await writeContractAsync(request));
    await Promise.all([refetchSub(),refetchBalance(),refetchWeeklyFee()]);
    // Save can be retried independently if login/email setup fails after payment.
    await save();
  }
  async function cancel() {
    const client=await ready();
    const {request}=await client!.simulateContract({account:address,address:CB,abi:chainBriefAbi,functionName:"cancel"});
    await wait(await writeContractAsync(request));await refetchSub();setStatus("Recurring billing cancelled. Your paid access remains until the displayed date.");
  }
  async function preview() {await authenticated();setStatus("Collecting recent headlines…");const data=await api("/api/newsletter");setDigest(data.summary);setStatus("Briefing ready.");}
  async function checkEmail() {
    await authenticated();const data=await api("/api/email/status");
    setEmailStatus(`${data.verified?"Email verified":"Email awaiting verification"} · ${data.enabled?"Emails enabled":"Emails stopped"}\n`+data.jobs.map((j:{kind:string;status:string;error:string|null})=>`${j.kind}: ${j.status}${j.error?` — ${j.error}`:""}`).join("\n"));setStatus("Email status refreshed. ‘Accepted’ means the provider accepted it; check your inbox and spam folder.");
  }
  async function loadPrefs() {
    await signIn();const data=await api("/api/subscribe");if(data.prefs){setEmail(data.prefs.email);setTopicsText(data.prefs.topics.join(", "));setNewsText((data.prefs.newsAlerts??[]).join(", "));setSymbol(data.prefs.alerts[0]?.symbol??"");setBelow(String(data.prefs.alerts[0]?.below??""));}setStatus("Signed in. Saved preferences loaded.");
  }
  return <main>
    <header><p className="eyebrow">YOUR SIGNAL, EVERY WEEK</p><h1>ChainBrief<span>.</span></h1><p className="lede">The topics you care about. One personal briefing. Weekly USDC payments you control.</p></header>
    <aside className="network"><strong>{chain.name}</strong> · Chain {chainId}{chainId===31337?" · Local mock USDC":" · USDC"}<button disabled={busy} onClick={()=>run(async()=>{await ready();setStatus("RPC and deployed contracts checked. Wallet is on the correct chain.");})}>Check connection</button></aside>
    {!configured&&<p className="notice">Contract addresses are missing. Deploy, run <code>npm run sync:local</code>, then restart the website.</p>}
    {!isConnected?<button className="primary" disabled={busy} onClick={()=>run(connect)}>Connect wallet</button>:<>
      <div className="wallet"><p>{address!.slice(0,6)}…{address!.slice(-4)} · {balance!==undefined?formatUnits(balance,6):"…"} USDC</p><button className="link" disabled={busy} onClick={()=>run(async()=>{await api("/api/auth/logout",{});disconnect();setSignedIn("");setEmailStatus("");setDigest("");})}>Disconnect</button></div>
      {walletChain!==chainId&&<p className="notice">Wallet network differs from the app. The next transaction will request a network switch.</p>}
      {sub&&<div className="plan"><strong>{sub[2]?"Recurring billing enabled":"Recurring billing off"}</strong><p>{sub[1]>0?`Paid until ${new Date(Number(sub[1])*1000).toLocaleString()}`:"No paid subscription"}</p>{weeklyFee!==undefined&&weeklyFee>0n&&<p>Agreed weekly payment: {formatUnits(weeklyFee,6)} USDC for {sub[0]} topics.</p>}</div>}
      <section><div className="section-title"><h2>Your briefing</h2><button className="link" disabled={busy} onClick={()=>run(loadPrefs)}>Sign in / load saved topics</button></div>
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
        <label>Topics, separated by commas<input value={topicsText} onChange={e=>setTopicsText(e.target.value)} placeholder="AI, Bengaluru FC, electric vehicles"/></label>
        <p className="hint">Choose 1–20 topics. Changing the topic count needs a new plan after your paid period ends.</p>
        <div className="row"><label>Stock alert symbol (optional)<input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="AAPL"/></label><label>Notify below (quote currency)<input type="number" min="0" step="any" value={below} onChange={e=>setBelow(e.target.value)} placeholder="150"/></label></div>
        <label>News alerts, separated by commas (optional)<input value={newsText} onChange={e=>setNewsText(e.target.value)} placeholder="Bengaluru FC, SpaceX"/></label>
        <p className="hint">Price and news alerts check once a minute when the alert worker is running. Stock alerts also need a configured market feed.</p>
        <p className="price">{topics.length} topics · {price!==undefined?formatUnits(price*BigInt(topics.length),6):"…"} USDC / week for a new plan</p>
        <p className="hint">First week paid now. Approval covers four payments total; replenish it when needed. The keeper pays transaction gas for renewals.</p>
        <div className="row"><button className="primary" disabled={busy||!configured||!!sub?.[2]} onClick={()=>run(subscribe)}>Subscribe</button><button disabled={busy} onClick={()=>run(save)}>Save preferences</button>{chainId===31337&&<button disabled={busy||!configured} onClick={()=>run(faucet)}>Get 100 test USDC</button>}</div>
        {sub?.[2]&&<div className="row"><button disabled={busy} onClick={()=>run(replenish)}>Approve next 4 renewals</button><button disabled={busy} onClick={()=>run(cancel)}>Cancel billing</button><button disabled={busy} onClick={()=>run(()=>approve(0n))}>Revoke USDC allowance</button></div>}
      </section>
      <section><h2>Delivery desk</h2><p className="hint">Confirm your email link, then keep the newsletter and mail workers running. Your first briefing is queued after verification; later briefings arrive weekly.</p><div className="row"><button disabled={busy} onClick={()=>run(preview)}>Preview briefing</button><button disabled={busy} onClick={()=>run(async()=>{await authenticated();const data=await api("/api/email/test",{});setStatus(data.message);})}>Send test email</button><button disabled={busy} onClick={()=>run(checkEmail)}>Check email status</button><button disabled={busy} onClick={()=>run(async()=>{await authenticated();const data=await api("/api/email/resend",{});setStatus(data.message);})}>Resend verification</button></div>{emailStatus&&<pre className="digest">{emailStatus}</pre>}</section>
    </>}
    {status&&<p className="status" role="status">{busy?"Working… ":""}{status}</p>}{digest&&<pre className="digest">{digest}</pre>}
    <footer>Cancel billing in your wallet-connected dashboard. Email unsubscribe stops messages only.</footer>
  </main>;
}
