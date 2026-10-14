import {spawn} from "node:child_process";
const names=["keeper","newsletters","alerts"];
if(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) names.push("mail");
else console.warn("Email delivery paused: set RESEND_API_KEY and EMAIL_FROM, then restart workers.");
const children=names.map(name=>spawn(process.execPath,["--import","tsx",`scripts/${name}.ts`],{stdio:"inherit",env:process.env}));
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;for(const child of children)child.kill("SIGTERM");};
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,stop);
for(const child of children)child.on("exit",(code)=>{if(!stopping){console.error(`Worker exited (${code}). Stopping the others; restart after fixing its logs.`);process.exitCode=code??1;stop();}});
