# Validation — 13 October 2026

Passed:

- 14 Foundry contract tests (including a 256-run fuzz test).
- 8 backend tests for input validation, wallet session/replay protection, origin checks, email verification, delivery acceptance/retry state, recipient changes and unsubscribe.
- TypeScript check and ESLint.
- Next.js production build.
- Real Anvil transaction smoke test: artifact deployment, mint, approve, subscribe, due renewal, cancellation and expiry.
- Automated Chromium browser flow against the production build with a simulated injected wallet backed by Anvil: connection, test-USDC mint, two-transaction subscription, signed login, saved preferences, email-link confirmation, restored preferences, actual keeper renewal and cancellation. No browser runtime errors on this flow.
- Visual inspection of the desktop dashboard.

Limits:

- Browser wallet tests used a simulated EIP-1193 wallet, not the actual MetaMask extension on your laptop.
- Email provider responses were mocked; no live email was sent. API acceptance is recorded separately from actual delivery.
- News collection, paid AI summarization and market provider access require working network connectivity and optional provider credentials. They were not exercised against live provider accounts in this verification.
- No public network deployment, independent security audit or production hosting was performed.

Use the root README to configure your own providers and run the included tests.
