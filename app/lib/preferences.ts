import { db, getUser, hash, token, queue, prefsOf, transaction } from "./db";
import { siteUrl, HttpError } from "./auth";
import type { Prefs } from "./message";
export function storePreferences(address: string, prefs: Prefs) {
  let verificationJobId: string | null = null;
  transaction(() => {
    const old = getUser(address), changed = !old || prefsOf(old).email !== prefs.email || !old.enabled;
    db.prepare("INSERT INTO users(address,prefs) VALUES(?,?) ON CONFLICT(address) DO UPDATE SET prefs=excluded.prefs").run(address,JSON.stringify(prefs));
    if (changed) {
      const verify=token();
      verificationJobId=`verify:${hash(verify)}`;
      db.prepare("UPDATE users SET verified=0, enabled=1, verify_hash=?, verify_expires=?, next_newsletter=0 WHERE address=?").run(hash(verify),Date.now()+86_400_000,address);
      queue(verificationJobId,address,"verification",{to:prefs.email,subject:"ChainBrief subscription successful - confirm your email",text:`Your ChainBrief subscription was successful.\n\nConfirm your email to receive your briefings:\n${siteUrl().origin}/api/email/verify?token=${verify}\n\nThis link expires in 24 hours. If you did not request this, ignore this message.`});
    }
  });
  return verificationJobId;
}
export function confirmEmail(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new HttpError("Invalid link.");
  const changed=db.prepare("UPDATE users SET verified=1, verify_hash=NULL, verify_expires=NULL WHERE verify_hash=? AND verify_expires>?").run(hash(value),Date.now());
  if(!changed.changes) throw new HttpError("Verification link expired or already used.");
}
export function stopEmail(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new HttpError("Invalid link.");
  const changed=db.prepare("UPDATE users SET enabled=0 WHERE unsubscribe_hash=?").run(hash(value));
  if(!changed.changes) throw new HttpError("Invalid unsubscribe link.");
}

export function resendVerification(address: string) {
  transaction(() => {
    const user=getUser(address);
    if(!user || !user.enabled) throw new HttpError("Save your email preferences first.");
    if(user.verified) throw new HttpError("Email already verified.");
    const proof=token();
    db.prepare("UPDATE users SET verify_hash=?,verify_expires=? WHERE address=?").run(hash(proof),Date.now()+86_400_000,address);
    queue(`verify:${hash(proof)}`,address,"verification",{to:prefsOf(user).email,subject:"Confirm your ChainBrief email",text:`Confirm your email to receive your ChainBrief briefings:\n${siteUrl().origin}/api/email/verify?token=${proof}\n\nThis link expires in 24 hours. Ignore if you did not request this.`});
  });
}
