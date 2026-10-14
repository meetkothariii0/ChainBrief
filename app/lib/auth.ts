import type { NextRequest } from "next/server";
import { db, hash } from "./db";
export class HttpError extends Error { constructor(message: string, public status = 400) {super(message);} }
export const siteUrl = () => new URL(process.env.SITE_URL ?? "http://localhost:3000");
export function sameOrigin(req: NextRequest) {
  if (req.headers.get("origin") !== siteUrl().origin) throw new HttpError("Origin rejected. Check SITE_URL matches the website URL.", 403);
}
export function sessionAddress(req: NextRequest): `0x${string}` {
  const id = req.cookies.get("chainbrief-session")?.value;
  const row = id ? db.prepare("SELECT address FROM sessions WHERE id=? AND expires>?").get(hash(id), Date.now()) as {address: `0x${string}`} | undefined : undefined;
  if (!row) throw new HttpError("Sign in with your wallet first.", 401);
  return row.address;
}
export function fail(e: unknown) {
  if (e instanceof HttpError) return Response.json({error: e.message}, {status: e.status});
  console.error(e);
  return Response.json({error: "Server operation failed. Check server logs and deployment configuration."}, {status: 503});
}
export async function body(req: NextRequest) {
  const text = await req.text();
  if (text.length > 16_384) throw new HttpError("Request too large.", 413);
  try {return JSON.parse(text);} catch {throw new HttpError("Invalid JSON.");}
}
