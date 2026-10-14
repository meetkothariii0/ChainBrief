import {NextRequest} from "next/server";
import {isActive,checkDeployment} from "@/lib/chain";
import {getUser,prefsOf,rateLimit} from "@/lib/db";
import {briefing} from "@/lib/pipeline";
import {sessionAddress,HttpError,fail} from "@/lib/auth";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
  try {
    const address=sessionAddress(req);
    if(!rateLimit(`preview:${address}`,3,60_000)) throw new HttpError("Please wait a minute before requesting another preview.",429);
    await checkDeployment();if(!await isActive(address)) throw new HttpError("No paid subscription.",402);
    const user=getUser(address);if(!user) throw new HttpError("Save your topics first.",404);
    return Response.json({summary:await briefing(prefsOf(user).topics)});
  } catch(e) {return fail(e);}
}
