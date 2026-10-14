import {NextRequest} from "next/server";
import {db,getUser} from "@/lib/db";
import {sessionAddress,fail} from "@/lib/auth";
export async function GET(req:NextRequest) {
  try {const address=sessionAddress(req),user=getUser(address);
    const jobs=db.prepare("SELECT kind,status,created,error FROM jobs WHERE address=? ORDER BY created DESC LIMIT 10").all(address);
    return Response.json({verified:!!user?.verified,enabled:!!user?.enabled,jobs});
  }catch(e){return fail(e);}
}
