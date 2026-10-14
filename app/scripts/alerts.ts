import {users,prefsOf,getState,setState,hash} from "../lib/db";
import {isActive,checkDeployment} from "../lib/chain";
import {queueBrief} from "../lib/email";
import {headlines} from "../lib/pipeline";
import {runWorker} from "../lib/worker";
export async function price(symbol:string):Promise<number|null> {
  const key=process.env.FINNHUB_API_KEY;if(!key) return null;
  const res=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`,{headers:{"X-Finnhub-Token":key},signal:AbortSignal.timeout(10_000)});
  if(!res.ok) throw new Error(`Quote provider failed (${res.status}).`);
  const data=await res.json();
  // Ignore zero/error quotes and stale observations. Feed coverage depends on provider plan.
  return typeof data.c==="number" && data.c>0 && typeof data.t==="number" && Math.abs(Date.now()/1000-data.t)<900 ? data.c:null;
}
export async function tick() {
  await checkDeployment();const cache=new Map<string,number|null>();
  for(const user of users()) {
    if(!user.verified || !user.enabled) continue;
    try {
      if(!await isActive(user.address as `0x${string}`)) continue;
      for(const query of prefsOf(user).newsAlerts??[]) {
        const items=await headlines(query,10);
        const key=`news-alert:${user.address}:${hash(query)}`;
        const old=getState(key),seen=JSON.parse(old??"[]") as string[];
        const fresh=items.filter(item=>!seen.includes(hash(item.link)));
        if(old && fresh.length) queueBrief(`news-alert:${hash(key)}:${hash(fresh.map(i=>i.link).join("|"))}`,user.address,"alert",`ChainBrief news: ${query}`,fresh.map(i=>`${i.title}\n${i.link}\n${i.published}`).join("\n\n"));
        setState(key,JSON.stringify([...new Set([...items.map(i=>hash(i.link)),...seen])].slice(0,100)));
      }
      for(const rule of prefsOf(user).alerts) {
        if(!cache.has(rule.symbol)) cache.set(rule.symbol,await price(rule.symbol));
        const p=cache.get(rule.symbol);if(p==null) continue;
        const key=`alert:${user.address}:${hash(JSON.stringify(rule))}`;
        const wasBelow=getState(key)==="below";
        if(p<rule.below && !wasBelow) queueBrief(`alert:${hash(key)}:${Date.now()}`,user.address,"alert",`ChainBrief: ${rule.symbol} below ${rule.below}`,`${rule.symbol} was quoted at ${p}, below your threshold ${rule.below}. Observed at ${new Date().toISOString()}. Check the market feed before acting.`);
        setState(key,p<rule.below?"below":"above");
      }
    } catch(e) {console.error(e instanceof Error?e.message:e);}
  }
}
if(!process.env.FINNHUB_API_KEY) console.warn("Stock alerts disabled until FINNHUB_API_KEY is set.");
runWorker("alerts",tick);
