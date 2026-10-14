import {NextRequest} from "next/server";
import {confirmEmail} from "@/lib/preferences";
import {sameOrigin,fail} from "@/lib/auth";
export const runtime="nodejs";
export async function GET(req: NextRequest) {
  const token=req.nextUrl.searchParams.get("token")??"";
  if(!/^[a-f0-9]{64}$/.test(token)) return new Response("Invalid link.",{status:400});
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChainBrief</title></head><body><h1>ChainBrief</h1><form method="post"><input type="hidden" name="token" value="${token}"><button>Confirm email</button></form><p><a href="/">Back to app</a></p></body></html>`,{headers:{"content-type":"text/html; charset=utf-8","referrer-policy":"strict-origin","cache-control":"no-store","content-security-policy":"default-src 'none'; form-action 'self'; base-uri 'none'"}});
}
export async function POST(req:NextRequest) {
  try {sameOrigin(req);const data=await req.formData();confirmEmail(String(data.get("token")??""));return new Response("Email verified. Your briefing will be queued by the newsletter worker.");}catch(e){return fail(e);}
}
