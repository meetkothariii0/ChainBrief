import {db,users,prefsOf,getState,setState} from "../lib/db";
import {isActive,checkDeployment} from "../lib/chain";
import {briefing} from "../lib/pipeline";
import {queueBrief} from "../lib/email";
import {runWorker} from "../lib/worker";
export async function tick() {
  await checkDeployment();
  for(const user of users()) {
    const now=Date.now();
    if(!user.enabled || !user.verified || user.next_newsletter>now || Number(getState(`news-retry:${user.address}`)??0)>now) continue;
    try {
      if(!await isActive(user.address as `0x${string}`)) continue;
      const text=await briefing(prefsOf(user).topics);
      queueBrief(`newsletter:${user.address}:${now}`,user.address,"newsletter","Your weekly ChainBrief",text);
      db.prepare("UPDATE users SET next_newsletter=? WHERE address=?").run(now+7*86_400_000,user.address);
    } catch(e) {setState(`news-retry:${user.address}`,String(now+300_000));console.error(e instanceof Error?e.message:e);}
  }
}
runWorker("newsletters",tick);
