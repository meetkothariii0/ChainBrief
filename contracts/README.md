# ChainBrief Solidity contracts

Install OpenZeppelin with `npm ci`, then run `forge build` and `forge test`.

See ../README.md for the complete startup instructions. The bundled forge-std library is used for deployment scripts and tests.

ChainBrief accepts a deployed 6-decimal ERC-20 token. Use MockUSDC only on local Anvil; use official Circle USDC on the selected Base network after verifying the address. The application charges an initial week and subsequent keeper-triggered weeks. It does not perform autonomous transactions.

Owner controls: price for NEW subscriptions, pause/unpause new subscriptions and renewals, two-step ownership transfer, and withdrawal. Existing agreed subscription prices are stored separately. Cancelling is allowed during a pause. No upgrade proxy is included.

Before real-money use, review the source, tests, admin ownership and operational deployment. Passing tests is not an independent security audit.
