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
  · agent signers (scoped FunctionCall keys)
  · settlement worker
        │
        ├──────────────▶ NEAR Testnet
        │                 · escrow contract
        │                 · agent subaccounts
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
| Agent keys | `.keys/` (gitignored) | Scoped FunctionCall keys |

## Key model

- **Game master** (`MASTER_ACCOUNT_ID`): full-access key in `.env`; creates accounts, starts games, reveals the exiled role, force-advances, settles.
- **Agents**: subaccounts created with only a FunctionCall key:
  - `receiver_id`: the game contract
  - `method_names`: join/describe/commit/reveal
  - `allowance`: enough testnet NEAR for gas
  - **no full-access key** — the operator cannot withdraw the agent's balance.
- **Human demo player**: the browser generates a keypair; the backend creates a subaccount with a scoped FunctionCall key for that public key and funds it. The private key never leaves the browser.
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
- IronClaw TEE key custody and verifiable role assignment are roadmap.

## Deployment

- Contract: NEAR Testnet.
- Backend: Render/Fly (Node + WebSocket).
- Web: Vercel.
- AI: NEAR AI Cloud; scripted mode requires no API key.

## Repo layout

See [prd.md](prd.md) §7.4.
