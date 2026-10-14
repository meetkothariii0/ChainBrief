# ChainBrief

Personalized weekly briefings with Solidity USDC subscriptions, wallet login, verified email delivery, and stock/news alerts.

## What works

- Connect an injected wallet, check network and deployed contracts, mint mock USDC on Anvil, approve a bounded allowance, subscribe and cancel.
- A keeper submits due renewals. Solidity prevents early/duplicate billing, fixes the agreed weekly price per subscriber, and never charges several missed weeks at once. Failed transfers revert state changes. Cancellation retains paid access.
- Wallet login uses a single-use, expiring, domain- and chain-bound message with an HTTP-only session cookie. Server routes enforce wallet ownership and paid access. Topic count must match the purchased plan.
- SQLite stores preferences, verification tokens, jobs, retry state and billing scan progress. Newsletters contain recent source links; Anthropic summarization is optional and falls back explicitly to headlines on failure.
- A durable email queue delivers via Resend, retries failed requests with the same payload and idempotency key, and records provider acceptance. Email verification and unsubscribe require clicking a confirmation button.
- Price threshold alerts use Finnhub. Optional news queries notify on new RSS headlines after the initial baseline. Workers poll every minute; these are near-real-time alerts, not guaranteed instant delivery.

## Requirements

- Node.js **24 LTS** (`node --version`). This project uses built-in `node:sqlite`.
- Foundry (`forge`, `anvil`, `cast`) already installed on your laptop.
- MetaMask or another injected wallet browser extension.

Extract this archive into a NEW folder named `chainbrief-updated` under Documents. It should contain `app`, `contracts` and this README directly. Keep your previous project folder as a backup. Dependencies and private configuration are intentionally excluded.

## Start in three Git Bash terminals

### Terminal 1: blockchain (leave running)

```bash
cd ~/Documents/chainbrief-updated
anvil
```

### Terminal 2: compile (finishes and exits)

```bash
cd ~/Documents/chainbrief-updated/contracts
npm ci
forge build
forge test
```

The forge-std dependency is bundled in `contracts/lib`. OpenZeppelin is installed by `npm ci`.

### Terminal 3: deploy locally, configure and start the website

```bash
cd ~/Documents/chainbrief-updated/app
npm ci
npm run deploy:local
npm run build
npm run start
```

`deploy:local` sends compiled contract bytecode ONLY to local Anvil, using its unlocked public test account. It checks chain ID 31337, deploys MockUSDC and ChainBrief, and creates/updates `.env.local` with the actual deployed addresses. It preserves email/AI secrets if `.env.local` already exists. You do not need to copy addresses manually.

Open **http://localhost:3000**. The build/start commands run the tested production version locally. For active code editing, you can use `npm run dev` instead. If the configured port is unavailable, stop the other server or change `SITE_URL` in `.env.local` to that exact origin, then restart. The same origin is required for wallet login and email links.

If the public addresses change, run `npm run build` again, then restart Next.js and all workers. Never deploy on every restart of the website: deployment creates a NEW subscription contract. Reuse the existing contract while Anvil is running.

## MetaMask and first subscription

1. Add network: RPC `http://127.0.0.1:8545`, chain ID `31337`, symbol `ETH`.
2. Import ONE test account printed by Anvil. Those keys are public; use them ONLY on Anvil.
3. Click **Connect wallet**, then **Check connection**.
4. Click **Get 100 test USDC** and confirm the local mint.
5. Enter a real email and 1–20 topics. Click **Subscribe**. Confirm USDC approval, subscription payment, then wallet login signature.
6. If payment succeeds but saving preferences fails, click **Save preferences**. It does not charge you again.
7. The first subscription approves FOUR payments total: the upfront week plus three renewals. Use **Approve next 4 renewals** later to replenish allowance. **Revoke USDC allowance** sets allowance to zero. **Cancel billing** turns recurring billing off immediately.

## Enable actual email sending

Open `app/.env.local` in VS Code. Set these SERVER-ONLY values:

```dotenv
SITE_URL=http://localhost:3000
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=ChainBrief <briefings@your-verified-domain.example>
```

Get the key from your own Resend account. Verify your sender domain and use a sender on that domain. A provider's test sender may restrict recipients to your account email. Do not use the placeholder domain above. See https://resend.com/docs/api-reference/emails/send-email and https://resend.com/docs/dashboard/domains/introduction.

Never add `NEXT_PUBLIC_` to provider keys or keeper private keys. Do not upload `.env.local` to GitHub. API credentials were not supplied with this project, so this download cannot send to your inbox until you configure them.

Open a FOURTH terminal:

```bash
cd ~/Documents/chainbrief-updated/app
npm run workers
```

This starts keeper, newsletters, alerts and mail workers together. If the email key/sender is missing, mail delivery stays disabled and jobs remain queued. Restart workers after editing `.env.local`.

- Check inbox/spam for the confirmation email and click its link, then **Confirm email**. The link expires in 24 hours.
- After confirmation, the newsletter worker queues your first briefing; the mail worker sends it. Subsequent briefings are weekly in wall-clock time.
- Click **Send test email** to queue a delivery test. **Check email status** shows queued/accepted/failed/skipped states.
- `accepted` means the email API accepted the request. It does not guarantee inbox delivery. This project does not yet consume delivery/bounce webhooks.
- If a verification link expires or gets lost, click **Resend verification**. This invalidates the old link and queues a new one (maximum three per hour).
- Email unsubscribe stops messages and alerts only. Cancel in the wallet dashboard to stop USDC billing.

Run workers separately if debugging: `npm run keeper`, `npm run newsletters`, `npm run alerts`, `npm run mail`. Add `-- --once` to individual worker commands for one cycle. Do not run several copies of the worker group.

## AI summaries and market alerts

For Anthropic headline summaries, set:

```dotenv
AI_API_KEY=your_anthropic_api_key
AI_MODEL=a_current_model_id_from_your_provider_console
```

The previous invalid hard-coded model name has been removed. Without both settings, the app clearly labels output as a headline digest. It does not scrape full articles or invent stock prices. RSS headline coverage can be incomplete; summaries include source links.

For stock alerts, set `FINNHUB_API_KEY`, enter a provider-supported symbol such as AAPL, and set a positive threshold in that quote's currency. Quote availability, exchange coverage and delay depend on your provider plan. Stale/zero quotes are ignored. Alerts fire when the observed price goes below the threshold, then rearm after it returns above. A price already below the threshold triggers once on first observation.

For news alerts, enter up to five comma-separated queries. The first poll establishes a baseline; later unseen headlines trigger an email. Feed indexing may lag behind publication. Confirm your email and keep all workers running.

Provider references: https://platform.claude.com/docs/en/api/messages/create and https://finnhub.io/docs/api/quote.

## Test automatic weekly billing locally

Keep Anvil and workers running. After subscribing:

```bash
cast rpc --rpc-url http://127.0.0.1:8545 evm_increaseTime 604800
cast rpc --rpc-url http://127.0.0.1:8545 evm_mine
```

The keeper uses blockchain time, so it renews when this block makes payment due. Newsletter scheduling uses wall-clock time, so time travel does not send a week's worth of email. The paid-access check also uses blockchain time.

Insufficient USDC or allowance leaves the due date unchanged. Keeper retries after five minutes; users have no unpaid access after expiry. It does not deactivate or confiscate funds. Cancelled subscriptions are never renewed. If you approve more allowance, wait for retry or restart does not clear the persisted backoff. You can also call `charge` locally to test a renewal.

## Troubleshooting the test-USDC button

- Run **Check connection**. Missing contract code means Anvil restarted or addresses are stale. Run `npm run deploy:local` with Anvil running, then rebuild the website (`npm run build`) and restart Next.js/workers.
- After an Anvil reset, use MetaMask's clear activity/nonce option for the imported test account if transactions show stale nonces. Clearing wallet activity does not deploy contracts.
- Confirm MetaMask uses RPC `http://127.0.0.1:8545`, chain `31337`.
- Use the app's actual origin consistently; don't mix localhost and 127.0.0.1 for cookies and email links.
- The mint button is local-only. Real USDC has no public `mint` faucet function.
- If other RPC errors remain, copy the full displayed details and Next.js terminal error. The generic original resource error did not prove one specific cause.

## Tests

```bash
cd contracts
forge test
cd ../app
npm test
npm run check
npm run lint
npm run build
npm run test:chain
```

`test:chain` starts a separate Anvil on port 18545 and tests actual local transactions against compiled artifacts; port 18545 must be free. It never publishes source or contacts a verification service.

Contract tests cover initial payment, early/duplicate renewal prevention, price stability, cancellations, failed payments, pause/admin controls and invalid topic counts. Backend tests use mocked email responses: wallet replay protection, session cookies, input validation, verification expiry, durable retries and unsubscribe.

## Deploy beyond your laptop

Local development is complete; a public service needs persistent hosting and configured providers.

- Supported application networks: Anvil 31337, Base Sepolia 84532 and Base 8453. On Base networks use the OFFICIAL Circle USDC address for that chain, not MockUSDC. Verify it at https://developers.circle.com/stablecoins/usdc-contract-addresses before deployment.
- The Solidity `Deploy.s.sol` script creates a mock token ONLY on chain 31337. Outside Anvil it requires `USDC_ADDRESS` to be set to a deployed 6-decimal token.
- Start with Base Sepolia. Deploy using a private funded testnet deployer, never a public Anvil key. Do not put private keys in shared commands or frontend files.
- Set `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC`, `NEXT_PUBLIC_USDC`, `NEXT_PUBLIC_CHAINBRIEF` and optionally private `RPC_URL`, all for the same chain. Set `DEPLOYMENT_BLOCK` to your deployment block so the keeper can scan forward in 500-block pages.
- Set `KEEPER_PRIVATE_KEY` to a dedicated wallet funded with network gas currency. Outside local development there is no automatic test-key fallback. Permissionless renewal means the keeper has no admin privileges and needs no USDC.
- Use HTTPS and set `SITE_URL` to your public origin. Email verification links must be reachable by recipients.
- Run Next.js and ONE worker group on a long-lived Node.js server with a persistent disk. Keep a single shared `DATABASE_PATH`; back it up securely. This SQLite implementation is appropriate for a single-host MVP, not ephemeral/multi-region serverless deployments. For horizontal scale, move storage, leases and jobs to Postgres/a managed queue.
- Use process supervision to restart workers, monitor failures and provider quotas, and add bounce/suppression webhooks before serving a large mailing list.
- The contract uses OpenZeppelin utilities and has tests, but has NOT received an independent security audit. Review the contract, operational controls and provider usage terms before accepting real-money subscriptions.

## Architecture

Browser → wallet-signed transaction → Solidity subscriptions → keeper renewal transactions.
Browser → wallet login → authenticated API → SQLite preferences and email verification.
Workers → news RSS / optional AI → persistent mail jobs → Resend → user inbox.
Alert worker → quotes / news feed → paid-access check → mail queue.

The contract stores topic count, weekly fee, payment expiry and recurring flag. It does not store email addresses, topics, alert rules, API credentials or article text. Smart contracts do not wake themselves up: the keeper submits the renewal transactions. Emails are sent off-chain.
