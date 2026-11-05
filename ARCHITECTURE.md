# Agent Undercover — Architecture

## Components

```text
Browser (React/Vite)
  · lobby, game, result/replay
  · generates a session keypair locally
  · signs description / vote commit / vote reveal
        │ WebSocket + signed txs
        ▼
Backend / Game Master (Node 22 + TypeScript + Socket.IO)
  · room state machine
  · role/word assignment + salts
  · AI orchestration (NEAR AI Cloud)
  · agent signers (two scoped FunctionCall keys per agent)
  · settlement worker
        │
        ├──────────────▶ NEAR Testnet
        │                 · escrow contract
        │                 · agent subaccounts + stake-only wallets
        │                 · session subaccounts
        │
        └──────────────▶ NEAR AI Cloud (OpenAI-compatible)
```

## Contract phases

```text
Lobby -> Describing -> VoteCommit -> VoteReveal -> RoleReveal
                                                       |
                                    +------------------+------------------+
                                    |                                     |
                              next round                            Finished
                                                                          |
                                                                      Settled
Any unsettled phase + deadline --------------------------------------> Refunded
```

## On-chain vs off-chain

| Data | Where | Notes |
|---|---|---|
| Stakes / pot | On-chain | Locked in the contract |
| Role commitments | On-chain | `sha256(role + ":" + salt)` |
| Descriptions | On-chain | ≤ 280 bytes per player per round |
| Vote commitments / reveals | On-chain | Verified before tally |
| Exiles / winners / payouts | On-chain | Rule-based |
| Agent reputation | On-chain | games / wins / losses / earnings |
| Role assignment, words, salts | Off-chain | Game master |
| AI prompts / reasoning | Off-chain | Logged for post-game replay |
| Agent wallet contracts | On-chain | Fixed stake → `join_room`; no withdrawal method |
| Agent keys | `.keys/` (gitignored) | Two scoped FunctionCall keys per agent |

## Key model

- **Game master** (`MASTER_ACCOUNT_ID`): full-access key in `.env`; creates accounts, starts games, reveals the exiled role, force-advances, settles.
- **Agents**: subaccounts with a stake-only wallet contract and exactly two FunctionCall keys:
  - game key: `receiver_id` = the game contract; `method_names` = `submit_description`, `commit_vote`, `reveal_vote`;
  - wallet key: `receiver_id` = the agent's own account; `method_names` = `stake`;
  - both keys have a gas allowance; **no full-access key**.
- **Why a wallet contract**: a NEAR FunctionCall access key cannot attach a deposit, so the account cannot call the payable `join_room` directly. `stake(room_id)` on the wallet contract forwards exactly the configured stake to `join_room`; it has no withdrawal, transfer, or arbitrary-call method. Winnings are transferred to the agent account by settlement and can only be used for future stakes.
- **Human demo player**: the browser generates a keypair; the backend creates a disposable subaccount, sets that public key as its full-access key, and funds it. The private key never leaves the browser; the backend holds no key for the session account.
- **Real wallet players** (stretch): Wallet Selector on testnet.

## Commit-reveal

- Role: `sha256(role + ":" + salt)`, stored at `start_game`.
- Vote: `sha256(target_account + ":" + salt)`, stored at `commit_vote`.
- Reveal: contract recomputes the hash and only counts a valid reveal.
- Settlement: the game master submits all role reveals; the contract verifies each commitment before paying.

## Trust model

The MVP is **not trustless**:

- The game master knows the roles and can, in principle, favor an agent.
- The game master holds the salts; if it disappears, the game cannot settle, but players can refund after the deadline.
- The contract still enforces the pot, the commit-reveal checks, the payout rule, and the timeout refund.
- The operator holds both agent keys but cannot withdraw agent funds: the wallet contract has no withdrawal path, and the account has no full-access key.
- IronClaw TEE key custody and verifiable role assignment are roadmap.

## Deployment

- Contract: NEAR Testnet.
- App: one Node service (Render; `render.yaml`). Express serves the API, the
  Socket.IO endpoint, the RPC relay, and the built web app from `web/dist`, so
  there is no cross-origin setup. Render sets `RENDER_EXTERNAL_URL`, which the
  server uses as the Socket.IO origin.
- Web static hosting on Vercel is optional; it needs `WEB_ORIGIN` and the API
  relay pointed at the backend.
- AI: NEAR AI Cloud; scripted mode requires no API key.
- Budget guard: new sessions are refused when the treasury is below
  `TREASURY_FLOOR_NEAR` (default 0.5 NEAR) or the master is below 0.1 NEAR, and
  the number of in-memory sessions is capped by `MAX_SESSIONS` (default 30).
- The Render free plan sleeps after inactivity; the first request after sleep
  pays a cold start. In-memory games do not survive a restart.

## Repo layout

See [prd.md](prd.md) §7.4.
