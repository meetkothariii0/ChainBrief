import {NextRequest} from "next/server";
import {sessionAddress,sameOrigin,HttpError,fail} from "@/lib/auth";
import {rateLimit} from "@/lib/db";
import {resendVerification} from "@/lib/preferences";
import {deliverQueuedJobNow} from "@/lib/delivery";
import {getUser} from "@/lib/db";
import {isActive} from "@/lib/chain";
export async function POST(req:NextRequest) {
  try {sameOrigin(req);const address=sessionAddress(req);
    if(!rateLimit(`resend:${address}`,3,3_600_000)) throw new HttpError("Verification resend limit reached. Retry in an hour.",429);
    if(!await isActive(address)) throw new HttpError("No paid subscription.",402);
    resendVerification(address);
    const user=getUser(address);
    const delivery=user?.verify_hash ? await deliverQueuedJobNow(`verify:${user.verify_hash}`) : {sent:false};
    return Response.json({message:delivery.sent?"Confirmation email sent. Check your inbox and spam folder.":`Confirmation email could not be sent: ${delivery.error??"it was queued for retry."}`});
  }catch(e){return fail(e);}
}
