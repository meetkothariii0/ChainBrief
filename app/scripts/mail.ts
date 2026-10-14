import {deliveryTick} from "../lib/delivery";
import {runWorker} from "../lib/worker";
if(!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Set RESEND_API_KEY and EMAIL_FROM in .env.local first.");
runWorker("mail",deliveryTick,5_000);
