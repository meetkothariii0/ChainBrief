import { NextRequest, NextResponse } from "next/server";
import { db, hash, token, transaction, rateLimit } from "@/lib/db";
import { sameOrigin, body, siteUrl, HttpError, fail } from "@/lib/auth";
import { publicClient } from "@/lib/chain";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const {nonce, signature} = await body(req);
    if (typeof nonce !== "string" || !/^[a-f0-9]{64}$/.test(nonce) || typeof signature !== "string" || !/^0x[a-fA-F0-9]+$/.test(signature) || signature.length > 4096) throw new HttpError("Invalid sign-in proof.");
    if (!rateLimit(`verify:${hash(nonce)}`,5)) throw new HttpError("Too many attempts.",429);
    const row = db.prepare("SELECT * FROM challenges WHERE id=? AND expires>?").get(hash(nonce),Date.now()) as {address: `0x${string}`; message: string} | undefined;
    if (!row) throw new HttpError("Sign-in challenge expired or already used.",401);
    if (!await publicClient.verifyMessage({address: row.address,message: row.message,signature: signature as `0x${string}`,mode:"eoa"})) throw new HttpError("Invalid signature.",401);
    const session = token();
    transaction(() => {
      const used = db.prepare("DELETE FROM challenges WHERE id=? AND expires>?").run(hash(nonce),Date.now());
      if (!used.changes) throw new HttpError("Challenge already used.",401);
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(hash(session),row.address,Date.now()+86_400_000);
    });
    const response = NextResponse.json({ok:true});
    response.cookies.set("chainbrief-session",session,{httpOnly:true,secure:siteUrl().protocol === "https:",sameSite:"strict",path:"/",maxAge:86_400});
    return response;
  } catch(e) {return fail(e);}
}
