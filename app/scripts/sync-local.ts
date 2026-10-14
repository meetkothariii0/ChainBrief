import fs from "node:fs";
const file = "../contracts/broadcast/Deploy.s.sol/31337/run-latest.json";
if (!fs.existsSync(file)) throw new Error("Deploy first: forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --private-key <ANVIL_TEST_KEY>");
const run = JSON.parse(fs.readFileSync(file, "utf8"));
const address = (name: string) => run.transactions.find((t: {contractName?: string; transactionType?: string}) => t.contractName === name && t.transactionType === "CREATE")?.contractAddress;
const cb = address("ChainBrief"), usdc = address("MockUSDC");
if (!cb || !usdc) throw new Error("Local deployment must include MockUSDC and ChainBrief.");
let env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : fs.readFileSync(".env.example", "utf8");
for (const [key, value] of Object.entries({NEXT_PUBLIC_CHAIN_ID: "31337", NEXT_PUBLIC_RPC: "http://127.0.0.1:8545", NEXT_PUBLIC_CHAINBRIEF: cb, NEXT_PUBLIC_USDC: usdc})) {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : env + `\n${line}`;
}
fs.writeFileSync(".env.local", env);
console.log(`Configured local USDC ${usdc} and ChainBrief ${cb}. For production, run npm run build, then restart website and workers.`);
