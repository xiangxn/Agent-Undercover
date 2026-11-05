# Deploy the hosted demo

The backend is one long-lived Node process: Express, Socket.IO, the game master,
the RPC relay, and the built web app all run together. Any host that runs a
container or a Node 22 service works. The contract stays on NEAR Testnet; only
the web app moves.

Free tiers change often. This page lists the paths that were prepared for this
repo; check the host's current signup requirements before promising a link.

## Variables

Public values are safe to commit. Private keys come from your local `.env` and
must be set in the host's dashboard, never in the repo.

```dotenv
DEMO_MODE=scripted
NEAR_RPC_URL=https://test.rpc.fastnear.com

CONTRACT_ACCOUNT_ID=game.agent-undercover.testnet
MASTER_ACCOUNT_ID=agent-undercover.testnet
TREASURY_ACCOUNT_ID=au-treasury.testnet

AGENT_ALPHA_ACCOUNT_ID=alpha.agents.agent-undercover.testnet
AGENT_BETA_ACCOUNT_ID=beta.agents.agent-undercover.testnet
AGENT_GAMMA_ACCOUNT_ID=gamma.agents.agent-undercover.testnet
AGENT_DELTA_ACCOUNT_ID=delta.agents.agent-undercover.testnet

SESSION_FUNDING_NEAR=0.25
TREASURY_FLOOR_NEAR=0.5
MASTER_MIN_BALANCE_NEAR=0.5
MASTER_TOPUP_NEAR=2
MAX_SESSIONS=100
```

Secrets, all Testnet-only:

```text
MASTER_PRIVATE_KEY
TREASURY_PRIVATE_KEY
AGENT_ALPHA_PRIVATE_KEY
AGENT_ALPHA_WALLET_PRIVATE_KEY
AGENT_BETA_PRIVATE_KEY
AGENT_BETA_WALLET_PRIVATE_KEY
AGENT_GAMMA_PRIVATE_KEY
AGENT_GAMMA_WALLET_PRIVATE_KEY
AGENT_DELTA_PRIVATE_KEY
AGENT_DELTA_WALLET_PRIVATE_KEY
```

`PORT` is provided by the host and read by the server. `WEB_ORIGIN` is only
needed when the public URL cannot be derived from `RENDER_EXTERNAL_URL` or
`RAILWAY_PUBLIC_DOMAIN`; set it to the full `https://...` URL in that case.

## Railway

[railway.json](../railway.json) sets the build and start commands; `.nvmrc`
pins Node 22.

1. Sign in at <https://railway.com> with GitHub.
2. **New Project → Deploy from GitHub repo** and pick this repository
   (authorize the Railway GitHub app if the repo is private).
3. Add the variables above, then fill the secrets from `.env`.
4. **Settings → Networking → Generate Domain**.
5. Open the URL; `/api/health` should return `{"ok":true,...}`.

A Railway service does not sleep by default. The free trial credit should cover
a demo window; check the current plan before relying on it long-term.

If the Nixpacks build fails, switch the service builder to **Dockerfile**: the
repo includes a [Dockerfile](../Dockerfile) that installs, builds the web app,
and starts the server on `PORT`.

## Render

[render.yaml](../render.yaml) is a Blueprint for one web service.

1. **New → Blueprint**, connect the repo, apply.
2. Enter the same secrets when prompted.
3. Wait for **Live**, then open the `onrender.com` URL.

Render may ask new accounts or workspaces to add a payment method before
creating a service. If that happens, use another host; the app does not need
Render-specific features.

## Any Docker host

```bash
docker build -t agent-undercover .
docker run --rm -p 8080:8080 --env-file .env \
  -e PORT=8080 -e WEB_ORIGIN=http://localhost:8080 \
  agent-undercover
```

The image listens on `PORT` (default in the image: 8080). Run one replica:
game state is in memory.

## Top up the treasury

The legacy helper page (<https://helper.testnet.near.org>) now returns 404, but
its API still creates and funds new accounts. The helper cannot top up an
existing account, so [scripts/topup-treasury.mjs](../scripts/topup-treasury.mjs)
mints a throwaway account, sends its balance to `TREASURY_ACCOUNT_ID` via
`deleteAccount`, and discards the key:

```bash
HTTPS_PROXY=http://127.0.0.1:1087 node scripts/topup-treasury.mjs
```

Drop `HTTPS_PROXY` when the helper is reachable directly. Each run adds roughly
10 NEAR, which is about 40 sessions at 0.25.

Alternatively, <https://near-faucet.io> (and the official faucet page at
<https://docs.near.org/getting-started/faucet>) sends NEAR to an existing
Testnet account from a browser form; enter the treasury account there.

## Caveats

- Each new game funds a disposable session with `SESSION_FUNDING_NEAR` (0.25):
  the player stakes 0.1 and the contract locks roughly another 0.1 of room
  storage. Budget about 0.25 NEAR per session and top up the treasury before
  sharing a link.
- Free services sleep after inactivity; the first request after sleep is slow.
- In-memory games do not survive a restart or redeploy.
- New sessions are refused below `TREASURY_FLOOR_NEAR`.
- The master also pays contract storage for `start_game`/`advance` (about 0.1
  NEAR per game). When it drops below `MASTER_MIN_BALANCE_NEAR`, the server
  moves `MASTER_TOPUP_NEAR` from the treasury into it automatically.
- The dashboard is the only place for keys. Do not put them in build variables
  or commit them.
