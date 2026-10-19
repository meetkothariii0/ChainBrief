import {db,getUser,prefsOf} from "./db";
import {sendMail} from "./email";
import {isActive} from "./chain";
import type {Mail} from "./db";
type Job={id:string;address:string;kind:string;payload:string;attempts:number;first_attempt:number};
export async function deliverQueuedJobNow(id: string) {
  const job=db.prepare("SELECT * FROM jobs WHERE id=? AND status='queued'").get(id) as Job | undefined;
  if(!job) return false;
  try {
    const mail=JSON.parse(job.payload) as Mail;
    const providerId=await sendMail(job.id,mail);
    db.prepare("UPDATE jobs SET status='accepted',provider_id=?,error=NULL,lease=0 WHERE id=? AND status='queued'").run(providerId,job.id);
    return true;
  } catch(e) {
    db.prepare("UPDATE jobs SET error=?,lease=0 WHERE id=? AND status='queued'").run(e instanceof Error?e.message:String(e),job.id);
    return false;
  }
}

export async function deliveryTick() {
  for(let i=0;i<5;i++) {
    const now=Date.now();
    const job=db.prepare(`UPDATE jobs SET lease=?, attempts=attempts+1, first_attempt=CASE WHEN first_attempt=0 THEN ? ELSE first_attempt END
      WHERE id=(SELECT id FROM jobs WHERE status='queued' AND due<=? AND lease<? ORDER BY created LIMIT 1) RETURNING *`).get(now+60_000,now,now,now) as Job | undefined;
    if(!job) return;
    try {
      const user=getUser(job.address),mail=JSON.parse(job.payload) as Mail;
      const verifyValid=job.kind!=="verification" || (!user?.verified && (user?.verify_expires??0)>now && job.id===`verify:${user?.verify_hash}`);
      if(!user || prefsOf(user).email!==mail.to || !user.enabled || !verifyValid || (job.kind!=="verification" && (!user.verified || !await isActive(job.address as `0x${string}`)))) {
        db.prepare("UPDATE jobs SET status='skipped',lease=0 WHERE id=?").run(job.id);continue;
      }
      // Resend's idempotency window is finite. Stop ambiguous retries before it expires.
      if(now-job.first_attempt>23*3_600_000 || job.attempts>12) {
        db.prepare("UPDATE jobs SET status='failed',error='Manual review required before retry',lease=0 WHERE id=?").run(job.id);continue;
      }
      const providerId=await sendMail(job.id,mail);
      db.prepare("UPDATE jobs SET status='accepted',provider_id=?,error=NULL,lease=0 WHERE id=?").run(providerId,job.id);
      console.log(`${job.kind} accepted by email provider (${providerId}).`);
    } catch(e) {
      const error=e instanceof Error?e.message:String(e);
      db.prepare("UPDATE jobs SET error=?,due=?,lease=0 WHERE id=?").run(error,now+Math.min(3_600_000,30_000*2**job.attempts),job.id);
      console.error(error);
    }
  }
}
