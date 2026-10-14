import {NextRequest} from "next/server";
import {sessionAddress,sameOrigin,HttpError,fail} from "@/lib/auth";
import {isActive} from "@/lib/chain";
import {getUser,rateLimit} from "@/lib/db";
import {queueBrief} from "@/lib/email";
export const runtime="nodejs";
export async function POST(req:NextRequest) {
  try {
    sameOrigin(req);const address=sessionAddress(req),user=getUser(address);
    if(!user?.verified || !user.enabled) throw new HttpError("Confirm your email first.");
    if(!await isActive(address)) throw new HttpError("No paid subscription.",402);
    if(!rateLimit(`test-email:${address}`,1,60_000)) throw new HttpError("Wait a minute before another test.",429);
    queueBrief(`test:${address}:${Math.floor(Date.now()/60_000)}`,address,"test","ChainBrief delivery test","Your ChainBrief email integration is working. Weekly briefings arrive while your subscription has paid access.");
    return Response.json({ok:true,message:"Test queued. Keep npm run mail running to deliver it."});
  }catch(e){return fail(e);}
}
