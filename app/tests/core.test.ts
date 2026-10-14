import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {validatePrefs} from "../lib/message";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"chainbrief-test-"));
const account=privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const address=account.address.toLowerCase();
let store:typeof import("../lib/db"),preferences:typeof import("../lib/preferences"),delivery:typeof import("../lib/delivery");
let challenge:typeof import("../app/api/auth/challenge/route"),verify:typeof import("../app/api/auth/verify/route"),auth:typeof import("../lib/auth");
const request=(url:string,data:unknown,origin="http://localhost:3000")=>new NextRequest(`http://localhost:3000${url}`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(data)});
before(async()=>{
  process.env.DATABASE_PATH=path.join(temp,"test.sqlite");process.env.SITE_URL="http://localhost:3000";
  process.env.RESEND_API_KEY="mock-key";process.env.EMAIL_FROM="ChainBrief <test@example.com>";
  store=await import("../lib/db");preferences=await import("../lib/preferences");delivery=await import("../lib/delivery");
  challenge=await import("../app/api/auth/challenge/route");verify=await import("../app/api/auth/verify/route");auth=await import("../lib/auth");
});
after(()=>{store.db.close();fs.rmSync(temp,{recursive:true,force:true});});
const prefs={email:"reader@example.com",topics:["AI"],alerts:[],newsAlerts:[]};
function freshUser() {
  store.db.exec("DELETE FROM users; DELETE FROM jobs; DELETE FROM state;");
  preferences.storePreferences(address,prefs);
  const job=store.db.prepare("SELECT * FROM jobs").get() as {id:string;payload:string};
  const proof=JSON.parse(job.payload).text.match(/token=([a-f0-9]{64})/)[1] as string;
  return {...job,proof};
}
test("preference validation blocks invalid and duplicate topic plans",()=>{
  assert.throws(()=>validatePrefs({...prefs,topics:["AI","AI"]}));
  assert.throws(()=>validatePrefs({...prefs,topics:Array(21).fill("topic")}));
  assert.throws(()=>validatePrefs({...prefs,alerts:[{symbol:"AAPL",below:-1}]}));
  assert.throws(()=>validatePrefs({...prefs,email:"bad"}));
});
test("login proves ownership, sets a private cookie, and rejects replay",async()=>{
  const response=await challenge.POST(request("/api/auth/challenge",{address:account.address}));
  assert.equal(response.status,200);const proof=await response.json();
  assert.match(proof.message,/localhost:3000/);assert.match(proof.message,/Chain ID: 31337/);
  const signature=await account.signMessage({message:proof.message});
  const login=await verify.POST(request("/api/auth/verify",{nonce:proof.nonce,signature}));assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie")!;assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=strict/i);
  const req=new NextRequest("http://localhost:3000/api/subscribe",{headers:{cookie:cookie.split(";")[0]}});
  assert.equal(auth.sessionAddress(req),address);
  const replay=await verify.POST(request("/api/auth/verify",{nonce:proof.nonce,signature}));assert.equal(replay.status,401);
});
test("cross-origin sign-in and unauthenticated reads are rejected",async()=>{
  const response=await challenge.POST(request("/api/auth/challenge",{address:account.address},"https://evil.example"));assert.equal(response.status,403);
  assert.throws(()=>auth.sessionAddress(new NextRequest("http://localhost:3000/api/subscribe")),/Sign in/);
});
test("verification must use the current token, expires, and is single-use",()=>{
  const job=freshUser();assert.equal(store.getUser(address)?.verified,0);
  preferences.confirmEmail(job.proof);assert.equal(store.getUser(address)?.verified,1);
  assert.throws(()=>preferences.confirmEmail(job.proof));
  const next=freshUser();store.db.prepare("UPDATE users SET verify_expires=0").run();assert.throws(()=>preferences.confirmEmail(next.proof));
});
test("provider acceptance persists and retrying cannot duplicate a completed job",async()=>{
  const job=freshUser(),original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_input,init)=>{calls++;assert.equal((init?.headers as Record<string,string>)["idempotency-key"],job.id);return Response.json({id:"mock-message-id"});};
  try {await delivery.deliveryTick();await delivery.deliveryTick();assert.equal(calls,1);const row=store.db.prepare("SELECT status,provider_id FROM jobs").get() as {status:string;provider_id:string};assert.equal(row.status,"accepted");assert.equal(row.provider_id,"mock-message-id");}finally{globalThis.fetch=original;}
});
test("provider failure keeps original payload queued with retry backoff",async()=>{
  const job=freshUser(),original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({error:"unavailable"},{status:503});
  try {await delivery.deliveryTick();const row=store.db.prepare("SELECT * FROM jobs").get() as {status:string;payload:string;due:number;attempts:number};assert.equal(row.status,"queued");assert.equal(row.payload,job.payload);assert.ok(row.due>Date.now());assert.equal(row.attempts,1);}finally{globalThis.fetch=original;}
});
test("changed recipient invalidates queued verification mail",async()=>{
  freshUser();preferences.storePreferences(address,{...prefs,email:"new@example.com"});
  const original=globalThis.fetch;const recipients:string[]=[];
  globalThis.fetch=async(_input,init)=>{recipients.push(JSON.parse(String(init?.body)).to[0]);return Response.json({id:"mock-id"});};
  try{await delivery.deliveryTick();assert.deepEqual(recipients,["new@example.com"]);}finally{globalThis.fetch=original;}
});
test("email unsubscribe persists without deleting the wallet account",()=>{
  freshUser();const proof=store.token();store.db.prepare("UPDATE users SET unsubscribe_hash=? WHERE address=?").run(store.hash(proof),address);
  preferences.stopEmail(proof);assert.equal(store.getUser(address)?.enabled,0);assert.ok(store.getUser(address));
});
