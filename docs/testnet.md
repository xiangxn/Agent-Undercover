# Testnet deployment — 2026-11-05

All accounts are on NEAR Testnet. No mainnet deployment, no mainnet transactions.

## Accounts

| Role | Account ID | Public key | Balance |
|---|---|---|---|
| Game master / parent | `agent-undercover.testnet` | `ed25519:368GhkimEswFPCuYPAFoJH4ftPGDq7JGo4NP3HDD15Ld` | ~0.42 NEAR |
| Contract | `game.agent-undercover.testnet` | `ed25519:2gEJdcU5mVyRKeQbqjRz8hVAXzM3uo2FwAtyr6PSvLXZ` | ~1.85 NEAR available (~8.39 total) |
| Agent namespace | `agents.agent-undercover.testnet` | `ed25519:FEF9HZCGpRPu4pufafaSRgodCFQ89yXK6MCzRyZd5PLB` | ~0.17 NEAR |
| Agent Alpha | `alpha.agents.agent-undercover.testnet` | game `ed25519:5zewwWQLb6mtir2ytHrX4R5u8MKtZd9s5ryxDJThZQgK` · wallet `ed25519:D9cQQ7aJUuRMA27FFuLWoHmjcUn2qYVw7EQcY9Dj2EpP` | ~0.37 NEAR |
| Agent Beta | `beta.agents.agent-undercover.testnet` | game `ed25519:2RN1DToirpNACiqWG75ucQsGZ5a3Pbp3MfxKKsJxnxn4` · wallet `ed25519:Cse5jSF6ufeDs3V6gv2HF4YngtPm4ocMVe6gwgAs2A4D` | ~0.41 NEAR |
| Agent Gamma | `gamma.agents.agent-undercover.testnet` | game `ed25519:3zoLEm3wo8mrwcYP5NVW2NJsri815VD5EnbbesC99rGE` · wallet `ed25519:9FQsA4fAzsKF5MujYprPmNdsK6vpF5ZVXo9hupdQf7cj` | ~0.63 NEAR |
| Agent Delta | `delta.agents.agent-undercover.testnet` | game `ed25519:CBCymHZjzZPcmK6h8cbgqH55isjtJdtD1mUBbkkHohtt` · wallet `ed25519:5U3koWogp2ugJcGYPhLHtUTheJq3sNJikvECEBtxX3VT` | ~0.77 NEAR |
| Funder (testnet only) | `au-funder.testnet` | `ed25519:AJ3N16Gmk2NaqzQwAApr4zwHpiEVfMygoWaZksQXT3j9` | ~0.15 NEAR |
| Operator treasury (testnet only) | `au-treasury.testnet` | `ed25519:2TL5WgRfFDMaAtmyy59Xnpn6gSiRenvBHnwV9APM3pSD` | ~2.65 NEAR |

Balances are **available** balances at 2026-11-05 and move with every game; check Explorer for current values. Agent totals are higher because each wallet contract's code stakes about 2 NEAR of storage.

Explorer: <https://testnet.nearblocks.io/address/game.agent-undercover.testnet>

The earlier prototype accounts `alpha.agent-undercover.testnet` … `delta.agent-undercover.testnet` still exist from before the wallet-contract design; the current build does not use them.

## Game contract

- Account: `game.agent-undercover.testnet`
- Game master: `agent-undercover.testnet`
- Code hash: `26dpVdYCana63hHMEV4uZp4aKu6M4c99jnPQe5bXTDST`
- Latest deploy tx: [`TggYAwbFquXd3t8vxMop57rR78h8o3XEXyqkRWpF9Eg`](https://testnet.nearblocks.io/txns/TggYAwbFquXd3t8vxMop57rR78h8o3XEXyqkRWpF9Eg)
- Initialized with `new(game_master = agent-undercover.testnet)`.

Build and deploy:

```bash
pnpm build:contracts
pnpm deploy:contract
```

## Agent wallet contract

Each agent account has the same tiny wallet deployed on it:

- Code hash: `6LhcM6wanDeiY3jUKrh1tN6e2bKuX5ZuuKzJUKxEfasP`
- State: `{ game_contract: "game.agent-undercover.testnet", stake: "100000000000000000000000" }`
- `stake(room_id)` requires `predecessor == current account`, accepts no deposit, and forwards exactly the configured stake to `game_contract.join_room`.
- No withdrawal, transfer, or arbitrary-call method.

Why it exists: a NEAR FunctionCall access key cannot attach a deposit, so an agent cannot call the payable `join_room` directly
(`AccessKeyDepositWithFunctionCallActionError: Deposit is not allowed with function call`). The wallet contract is how the
agent spends its own balance while keeping the operator unable to withdraw it.

## Agent key model

Each agent account has **two** access keys and **no full-access key**:

| Key | Receiver | Methods | Allowance |
|---|---|---|---|
| game | `game.agent-undercover.testnet` | `submit_description`, `commit_vote`, `reveal_vote` | 0.5 NEAR |
| wallet | the agent's own account | `stake` | 0.5 NEAR |

Verify keys:

```bash
curl -s https://rpc.testnet.fastnear.com \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{
       "request_type":"view_access_key_list",
       "finality":"final",
       "account_id":"alpha.agents.agent-undercover.testnet"}}'
```

Expect two `FunctionCall` keys and no `FullAccess`. Verify the wallet config:

```bash
curl -s https://rpc.testnet.fastnear.com \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{
       "request_type":"call_function","finality":"final",
       "account_id":"alpha.agents.agent-undercover.testnet",
       "method_name":"get_stake","args_base64":""}}'
```

## Scripted game (M1)

Room `m1-1793863430024`, five players, host exiled as the impostor, crew won, four agents paid 0.125 NEAR each.

| Step | Tx |
|---|---|
| `create_room` | [`Bqon1cbNdEk3ukrsKCPk4abgwFQmpJUwVmue2PNtocT`](https://testnet.nearblocks.io/txns/Bqon1cbNdEk3ukrsKCPk4abgwFQmpJUwVmue2PNtocT) |
| Alpha stake → join | [`CdnxSAVWwaCHy5xvfNwPKth4SUHrVmstuhFPAsVN4gS6`](https://testnet.nearblocks.io/txns/CdnxSAVWwaCHy5xvfNwPKth4SUHrVmstuhFPAsVN4gS6) |
| Beta stake → join | [`AH5TzGeZu9NM1XYrqAZooiiMyPnfYQKqizsxoZo4d1gS`](https://testnet.nearblocks.io/txns/AH5TzGeZu9NM1XYrqAZooiiMyPnfYQKqizsxoZo4d1gS) |
| Gamma stake → join | [`5zXTtHARzbLxNGrMY4qxMDho36L2uB4AsUs7LWdQW3wi`](https://testnet.nearblocks.io/txns/5zXTtHARzbLxNGrMY4qxMDho36L2uB4AsUs7LWdQW3wi) |
| Delta stake → join | [`J1CWXcRfJi4pK4ACNJHAGrbKoTbzBfewiPofsGD7yGsS`](https://testnet.nearblocks.io/txns/J1CWXcRfJi4pK4ACNJHAGrbKoTbzBfewiPofsGD7yGsS) |
| `start_game` | [`3QMdiSKYxbtGijjb2MpMNs1SbNVWh6tN2aujBLNaSwod`](https://testnet.nearblocks.io/txns/3QMdiSKYxbtGijjb2MpMNs1SbNVWh6tN2aujBLNaSwod) |
| `reveal_role` | [`H85rmfbNQhnwo23GFAnhU6Pb551biBxmFTLzZ1K8sHMH`](https://testnet.nearblocks.io/txns/H85rmfbNQhnwo23GFAnhU6Pb551biBxmFTLzZ1K8sHMH) |
| `advance` | [`2n7URrNaUcMgksDsZj8a6JkSV3YGubTevUX3FrJzqzSv`](https://testnet.nearblocks.io/txns/2n7URrNaUcMgksDsZj8a6JkSV3YGubTevUX3FrJzqzSv) |
| `settle` | [`2wZNAU1TYcaSK7PrrejfMeCwP4AQCJoGZ8VTkk2BtjHg`](https://testnet.nearblocks.io/txns/2wZNAU1TYcaSK7PrrejfMeCwP4AQCJoGZ8VTkk2BtjHg) |

Reproduce:

```bash
pnpm build:contracts
pnpm setup:agents   # idempotent; needs .keys/ accounts
node --env-file=.env scripts/demo-scripted.mjs
```

## Secret material

Private keys live only in `.keys/` and `.env`, both gitignored. The repository contains no private keys.
