import { NextRequest, NextResponse } from "next/server";
import {db,hash} from "@/lib/db";
import {sameOrigin,fail} from "@/lib/auth";
export async function POST(req: NextRequest) {
  try {sameOrigin(req); const value=req.cookies.get("chainbrief-session")?.value;
    if(value) db.prepare("DELETE FROM sessions WHERE id=?").run(hash(value));
    const res=NextResponse.json({ok:true}); res.cookies.delete("chainbrief-session"); return res;
  } catch(e) {return fail(e);}
}
