import {NextRequest} from "next/server";
import {sessionAddress,sameOrigin,HttpError,fail} from "@/lib/auth";
import {rateLimit} from "@/lib/db";
import {resendVerification} from "@/lib/preferences";
import {isActive} from "@/lib/chain";
export async function POST(req:NextRequest) {
  try {sameOrigin(req);const address=sessionAddress(req);
    if(!rateLimit(`resend:${address}`,3,3_600_000)) throw new HttpError("Verification resend limit reached. Retry in an hour.",429);
    if(!await isActive(address)) throw new HttpError("No paid subscription.",402);
    resendVerification(address);return Response.json({message:"New verification email queued. The previous link is invalid."});
  }catch(e){return fail(e);}
}
