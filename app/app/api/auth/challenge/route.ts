import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { db, hash, token, rateLimit } from "@/lib/db";
import { sameOrigin, body, siteUrl, HttpError, fail } from "@/lib/auth";
import { chainId } from "@/lib/network";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const {address} = await body(req);
    if (typeof address !== "string" || !isAddress(address)) throw new HttpError("Invalid wallet address.");
    if (!rateLimit(`challenge:${address.toLowerCase()}`) || !rateLimit("challenge-global",200)) throw new HttpError("Too many sign-in requests. Retry later.",429);
    db.prepare("DELETE FROM challenges WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    const nonce = token(), expires = Date.now() + 300_000, site = siteUrl();
    const message = `${site.host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to ChainBrief. This does not authorize a payment.\n\nURI: ${site.origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(expires).toISOString()}`;
    db.prepare("INSERT INTO challenges VALUES(?,?,?,?)").run(hash(nonce),address.toLowerCase(),message,expires);
    return Response.json({nonce,message});
  } catch(e) {return fail(e);}
}
