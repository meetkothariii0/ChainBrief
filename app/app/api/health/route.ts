import { checkDeployment } from "@/lib/chain";
export const runtime = "nodejs";
export async function GET() {
  try {await checkDeployment(); return Response.json({ok:true,emailConfigured:!!process.env.RESEND_API_KEY,aiConfigured:!!(process.env.AI_API_KEY && process.env.AI_MODEL)});}
  catch(e) {return Response.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:503});}
}
