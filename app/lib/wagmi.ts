import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, rpc } from "./network";
export const config = createConfig({
  chains: [chain], connectors: [injected()],
  transports: { [chain.id]: http(rpc) }, ssr: true,
});
