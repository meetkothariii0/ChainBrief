import { db, queue, hash, token, getUser, prefsOf } from "./db";
import { siteUrl } from "./auth";
export function queueBrief(id: string, address: string, kind: string, subject: string, text: string) {
  const user=getUser(address);
  if(!user?.verified || !user.enabled) return;
  const unsubscribe=token();
  // Existing tokens remain valid until preferences are explicitly re-enabled.
  let footer="";
  if(!user.unsubscribe_hash) {
    db.prepare("UPDATE users SET unsubscribe_hash=? WHERE address=?").run(hash(unsubscribe),address);
    db.prepare("INSERT OR REPLACE INTO state(key,value) VALUES(?,?)").run(`unsubscribe:${address}`,unsubscribe);
  }
  const row=db.prepare("SELECT value FROM state WHERE key=?").get(`unsubscribe:${address}`) as {value:string};
  footer=`\n\nStop emails: ${siteUrl().origin}/api/email/unsubscribe?token=${row.value}\nTo stop USDC charges, cancel your subscription in the app.\nHeadlines and price alerts may be delayed; check original sources.`;
  queue(id,address,kind,{to:prefsOf(user).email,subject,text:text+footer});
}
export async function sendMail(id: string, mail: {to:string;subject:string;text:string}): Promise<string> {
  const apiKey=process.env.RESEND_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();
  if(!apiKey || !from) throw new Error("Set RESEND_API_KEY and EMAIL_FROM before running email delivery.");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",signal:AbortSignal.timeout(20_000),
    headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json","idempotency-key":id},
    body:JSON.stringify({from,to:[mail.to],subject:mail.subject,text:mail.text}),
  });
  if(!response.ok) {
    let detail="check key, sender domain and recipient restrictions.";
    try { const body=await response.json() as {message?:string}; if(body.message) detail=body.message; } catch {}
    throw new Error(`Email provider rejected request (${response.status}): ${detail}`);
  }
  const data=await response.json(); if(typeof data.id!=="string") throw new Error("Email provider returned no ID.");
  return data.id;
}
