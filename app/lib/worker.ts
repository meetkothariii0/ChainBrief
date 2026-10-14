import {lock,unlock} from "./db";
export async function runWorker(name: string, tick:()=>Promise<void>, interval=60_000) {
  let stopping=false;
  for(const signal of ["SIGINT","SIGTERM"] as const) process.on(signal,()=>{stopping=true;});
  console.log(`${name} worker running. Press Ctrl+C to stop.`);
  do {
    if(lock(name,300)) {
      try {await tick();} catch(e) {console.error(`${name}:`,e instanceof Error?e.message:e);}
      finally {unlock(name);}
    }
    if(process.argv.includes("--once") || stopping) break;
    await new Promise<void>(resolve=>{
      const finish=()=>{clearTimeout(timer);process.off("SIGINT",finish);process.off("SIGTERM",finish);resolve();};
      const timer=setTimeout(finish,interval);process.once("SIGINT",finish);process.once("SIGTERM",finish);
    });
  } while(!stopping);
}
