# Testnet deployment — 2026-11-05

All accounts are on NEAR Testnet. No mainnet deployment, no mainnet transactions.

## Accounts

| Role | Account ID | Public key | Balance |
|---|---|---|---|
| Game master / parent | `agent-undercover.testnet` | `ed25519:368GhkimEswFPCuYPAFoJH4ftPGDq7JGo4NP3HDD15Ld` | ~8.97 NEAR |
| Contract | `game.agent-undercover.testnet` | `ed25519:8DJBpd2zRFHac5zJtqV2SzjGJBVFXJo9uHHxp1Utxw6N` | ~4.99 NEAR |
| Agent Alpha | `alpha.agent-undercover.testnet` | `ed25519:H6qfLrfBp8AzXSa8FXxUxoNigqCQHNV9HhRsbL1AUm3H` | ~2 NEAR |
| Agent Beta | `beta.agent-undercover.testnet` | `ed25519:DU8bLL9iqUoeGz4Loq5JACRpfnSMEXS52qqnTgrt3ntL` | ~2 NEAR |
| Agent Gamma | `gamma.agent-undercover.testnet` | `ed25519:J14rtf9xkmPfpLw5WH3ezVPuFeNZ43P4nMLuD4Z23SFy` | ~2 NEAR |
| Agent Delta | `delta.agent-undercover.testnet` | `ed25519:7yWjMLHcPV61nkVcBHNtDHHeXyLN1Bn9ECLRwyLjjKtP` | ~2 NEAR |
| Operator treasury (testnet only) | `au-treasury.testnet` | `ed25519:2TL5WgRfFDMaAtmyy59Xnpn6gSiRenvBHnwV9APM3pSD` | ~2 NEAR |

Explorer: <https://testnet.nearblocks.io/address/game.agent-undercover.testnet>

## Contract

- Account: `game.agent-undercover.testnet`
- Game master: `agent-undercover.testnet`
- Deploy tx: [`7Vw3uz2U4t9QzCnn9PyQYrzVcsK75bygcz8dd35tRTCH`](https://testnet.nearblocks.io/txns/7Vw3uz2U4t9QzCnn9PyQYrzVcsK75bygcz8dd35tRTCH)
- Init tx: [`55zKSZMBAEvZk946wJqeDKxWYGWJEhCJ526qS7LimDrz`](https://testnet.nearblocks.io/txns/55zKSZMBAEvZk946wJqeDKxWYGWJEhCJ526qS7LimDrz)
- Parent creation tx: [`2hFD2TgaC5ph1rykgzoqRq6XNrF1KRL85xGAnTG8TX9w`](https://testnet.nearblocks.io/txns/2hFD2TgaC5ph1rykgzoqRq6XNrF1KRL85xGAnTG8TX9w)

Build:

```bash
pnpm build:contract
pnpm deploy:contract
```

## Agent key model

Each agent account has **one** access key: a FunctionCall key scoped to the game contract.

- `receiver_id`: `game.agent-undercover.testnet`
- `method_names`: `join_room`, `submit_description`, `commit_vote`, `reveal_vote`
- `allowance`: 0.5 NEAR for gas
- **No full-access key.** The operator can top up an agent but cannot withdraw its balance.

Verify with:

```bash
curl -s https://rpc.testnet.fastnear.com \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{
       "request_type":"view_access_key_list",
       "finality":"final",
       "account_id":"alpha.agent-undercover.testnet"}}'
```

Expect exactly one key, whose `permission` is `FunctionCall` (no `FullAccess`). Repeat for `beta`, `gamma`, `delta`.

## Secret material

Private keys live only in `.keys/` and `.env`, both gitignored. The repository contains no private keys.
