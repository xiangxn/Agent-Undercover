# Agent Undercover

> A 5-player social deduction game where every seat can be a human or an AI agent — and each agent owns its own NEAR subaccount, stakes its own money, lies to your face, and keeps what it wins.

**Status:** in development for NEAR Hackathon 2026 (testnet). Contract address and demo links are added on deployment.

## The problem

In online social deduction games, "AI players" are usually scripts: they have no wallet, no assets, and no consequences. They can lie for free.

Agent Undercover makes the AI players real economic actors. Each agent has a persistent NEAR subaccount, stakes its own testnet NEAR, and keeps its winnings. The escrow contract enforces the pot and the payouts. A scoped FunctionCall key lets an agent play the game but never withdraw its funds — not even the operator can.

## How the game works

- 5 players; each seat can be a human or an AI agent. The demo runs 1 human + 4 agents.
- One player is the impostor. Everyone gets a secret word; the impostor gets a similar word. Agents can be crew or impostor.
- Each round, every player describes their word in one public sentence.
- The crew votes to exile the impostor; votes use commit-reveal.
- Crew wins by exiling all impostors. Impostors win by reaching parity or surviving the round limit.
- The winning side splits the pot. Exiled players lose their stake.

Full rules: [RULES.md](RULES.md). Architecture and trust model: [ARCHITECTURE.md](ARCHITECTURE.md). Product spec: [prd.md](prd.md).

## How NEAR is used

- **Custom escrow contract** (`near-sdk-rs`, testnet): stakes, phases, commit-reveal checks, tally, payouts, refunds, agent reputation.
- **Persistent subaccounts**: `alpha.<parent>.testnet`, `beta...`, `gamma...`, `delta...`.
- **Scoped FunctionCall access keys**: each agent can only call the game contract; no full-access key exists.
- **NEAR AI Cloud**: OpenAI-compatible inference for agent dialogue and strategy.
- **NEP-366 / IronClaw / Intents**: roadmap, not MVP dependencies.

## Quickstart

> Commands are filled in as modules land. The scripted mode is the reproducible path for judges: it needs no AI API key.

```bash
# prerequisites: Rust + wasm32-unknown-unknown, Node 22+, pnpm
rustup target add wasm32-unknown-unknown

pnpm install
cp .env.example .env      # fill in testnet keys
pnpm build:contract
pnpm test:contract

# once deployed:
pnpm demo:scripted        # full 5-player game on testnet, no LLM
pnpm dev                  # backend + web
```

Testnet contract: `<!-- FILL AFTER DEPLOY -->`

Agent accounts:
- `<!-- alpha... -->`
- `<!-- beta... -->`
- `<!-- gamma... -->`
- `<!-- delta... -->`

## Trust model

This MVP is **not trustless**. The operator runs the game master and the agents:

- On-chain: stakes, role commitments, public descriptions, vote commitments/reveals, exiles, payouts, reputation.
- Off-chain: role/word assignment, salts, AI prompts and behavior.
- The contract verifies every reveal against an on-chain commitment and pays only according to the rules.
- The game master can stall, but players can call `refund` after the game deadline.
- Each agent has a scoped key and no full-access key; the operator can top up an agent but cannot withdraw its winnings.
- IronClaw TEE key custody is roadmap.

## Hackathon tracks

| Track | What it sees |
|---|---|
| `games` (primary) | A playable 5-minute social deduction loop; NPCs with wallets; no wallet popup in the demo |
| `agents` | Agents stake their own funds, keep winnings, accumulate reputation; scoped keys |
| `swarms` | Four agents with private strategies; impostors coordinate; post-game reasoning replay |

## License

MIT
