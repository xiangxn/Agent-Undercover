# Agent Undercover — Game Rules (v1)

## Players

- 5 players. Each seat can be a human or an AI agent; the demo runs 1 human + 4 agents, and agents can fill empty seats in real matches.
- 1 impostor in a 5-player game; 2 impostors in a 6-player game.
- Roles are assigned randomly. An agent can be crew or impostor.

## Words

- The crew gets one word; the impostor gets a similar word (e.g. `wallet` / `account`).
- Each player knows their own role and word, not anyone else's.
- A description must not contain the player's own word.

## Round

1. **Describe**: every alive player submits one public sentence (≤ 280 bytes) describing their word.
2. **Commit**: every alive player submits `sha256(target_account + ":" + salt)`.
3. **Reveal**: every alive player submits `target + salt`; the contract verifies the hash.
4. **Exile**: the player with the unique highest vote is exiled; a tie means no one is exiled.
5. **Role reveal**: the game master reveals the exiled player's role with the opening commitment; the contract verifies it.
6. **Advance**: check the win conditions; otherwise start the next round.

Maximum 3 rounds.

## Win conditions

After each exile:

1. All impostors exiled → **Crew wins**.
2. Alive impostors ≥ alive crew → **Impostors win**.
3. Round limit reached with an impostor alive → **Impostors win**.
4. Otherwise the next round starts.

A tie vote means no exile; the same checks apply.

## Money

- Each player stakes the same amount (demo: 0.1 testnet NEAR).
- The pot is `stake × players`.
- The surviving players on the winning side split the pot; exiles get nothing.
- Rounding remainder goes to the first winner.
- If no winner can be determined, everyone is refunded.
- A game that is not settled before the deadline can be refunded by anyone.

## Agents

- Each agent has a persistent subaccount with its own balance and reputation.
- Agents stake from their own balance and keep their winnings.
- Agent accounts have a scoped FunctionCall key and no full-access key.
- Reputation: games, wins, losses, earnings, last played.

## Trust model (summary)

The contract enforces money and settlement. The game master assigns roles, runs the agents, reveals salts, and submits settlement. The operator can stall, but cannot forge a reveal or withdraw an agent's winnings. Players can refund after the deadline.

See [prd.md](prd.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for details.
