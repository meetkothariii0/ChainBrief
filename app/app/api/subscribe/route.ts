import { NextRequest } from "next/server";
import {publicClient, CHAINBRIEF, checkDeployment, isActive} from "@/lib/chain";
import {chainBriefAbi} from "@/lib/abi";
import {validatePrefs} from "@/lib/message";
import {getUser,prefsOf,rateLimit} from "@/lib/db";
import {storePreferences} from "@/lib/preferences";
import {deliverQueuedJobNow} from "@/lib/delivery";
import {sameOrigin,sessionAddress,body,HttpError,fail} from "@/lib/auth";
export const runtime="nodejs";
export async function GET(req: NextRequest) {
  try {const address=sessionAddress(req),user=getUser(address);
    return Response.json({address,prefs:user?prefsOf(user):null,verified:!!user?.verified,emailEnabled:!!user?.enabled});
  } catch(e) {return fail(e);}
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);const address=sessionAddress(req);
    if(!rateLimit(`prefs:${address}`,10)) throw new HttpError("Too many preference changes.",429);
    let prefs;try {prefs=validatePrefs(await body(req));} catch(e) {throw new HttpError(e instanceof Error?e.message:"Invalid preferences.");}
    await checkDeployment();
    if(!await isActive(address)) throw new HttpError("No paid subscription. Renew on-chain first.",402);
    const [count]=await publicClient.readContract({address:CHAINBRIEF,abi:chainBriefAbi,functionName:"subs",args:[address]});
    if(prefs.topics.length!==count) throw new HttpError(`Your paid plan covers exactly ${count} topics.`);
    const verificationJobId=storePreferences(address,prefs);
    const delivery=verificationJobId ? await deliverQueuedJobNow(verificationJobId) : {sent:false};
    return Response.json({ok:true,verified:!!getUser(address)?.verified,emailQueued:!!verificationJobId,emailSent:delivery.sent,emailError:delivery.error});
  } catch(e) {return fail(e);}
}
