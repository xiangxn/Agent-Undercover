import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(ROOT, ".env") });

const env = process.env;

function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

// A session pays the 0.1 stake and ~0.1 of room storage in create_room before
// the engine can start. Funding less than this mints an account that cannot
// open a room, so fail at boot instead of on the first player's click.
const sessionFundingNear = env.SESSION_FUNDING_NEAR ?? "0.25";
if (Number(sessionFundingNear) < 0.22) {
  throw new Error(
    "SESSION_FUNDING_NEAR must be at least 0.22 NEAR (stake + room storage + gas)",
  );
}

export const config = {
  root: ROOT,
  port: Number(env.PORT ?? 8787),
  // Hosts expose the service URL; the server also serves the built web app,
  // so same-origin Socket.IO works without configuring WEB_ORIGIN.
  webOrigin:
    env.WEB_ORIGIN ??
    env.RENDER_EXTERNAL_URL ??
    (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined) ??
    "http://localhost:5173",
  rpcUrl: env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
  contractId: required("CONTRACT_ACCOUNT_ID"),
  masterAccountId: required("MASTER_ACCOUNT_ID"),
  masterPrivateKey: required("MASTER_PRIVATE_KEY"),
  treasuryAccountId: required("TREASURY_ACCOUNT_ID"),
  treasuryPrivateKey: required("TREASURY_PRIVATE_KEY"),
  sessionFundingNear,
  sessionTopUpNear: env.SESSION_TOPUP_NEAR ?? "0.2",
  // Refuse new sessions below this treasury balance. The public demo cannot
  // drain a shared Testnet account faster than it can be topped up.
  treasuryFloorNear: env.TREASURY_FLOOR_NEAR ?? "0.5",
  // The game-master signs start_game/advance/settle, so it pays the contract
  // storage those calls add (~0.1 NEAR per game). Refill it from the treasury
  // before it gets too low to start the next demo.
  masterMinBalanceNear: env.MASTER_MIN_BALANCE_NEAR ?? "0.5",
  masterTopUpNear: env.MASTER_TOPUP_NEAR ?? "2",
  maxSessions: Number(env.MAX_SESSIONS ?? 100),
  agentMinBalanceNear: env.AGENT_MIN_BALANCE_NEAR ?? "0.30",
  agentTopUpNear: env.AGENT_TOPUP_NEAR ?? "0.20",
  demoMode: (env.DEMO_MODE ?? "scripted") as "live" | "scripted",
  nearAiBaseUrl: env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1",
  nearAiApiKey: env.NEAR_AI_API_KEY ?? "",
  nearAiModel: env.NEAR_AI_MODEL || "Qwen/Qwen3-30B-A3B-Instruct-2507",
  stakeYocto: env.AGENT_STAKE_YOCTO ?? "100000000000000000000000",
  maxRounds: 3,
  players: 5,
  runsDir: join(ROOT, "runs"),
};

export type AgentId = "alpha" | "beta" | "gamma" | "delta";

export interface AgentConfig {
  id: AgentId;
  name: string;
  persona: string;
  accountId: string;
  gameKey: string;
  walletKey: string;
}

export const agents: AgentConfig[] = [
  {
    id: "alpha",
    name: "Alpha",
    persona: "The analyst. Cites other players' words, builds logical cases, likes lists.",
    accountId: required("AGENT_ALPHA_ACCOUNT_ID"),
    gameKey: required("AGENT_ALPHA_PRIVATE_KEY"),
    walletKey: required("AGENT_ALPHA_WALLET_PRIVATE_KEY"),
  },
  {
    id: "beta",
    name: "Beta",
    persona: "The contrarian. Questions the majority and happily derails the room.",
    accountId: required("AGENT_BETA_ACCOUNT_ID"),
    gameKey: required("AGENT_BETA_PRIVATE_KEY"),
    walletKey: required("AGENT_BETA_WALLET_PRIVATE_KEY"),
  },
  {
    id: "gamma",
    name: "Gamma",
    persona: "The peacemaker. Agrees first, then adds a small observation; great at blending in.",
    accountId: required("AGENT_GAMMA_ACCOUNT_ID"),
    gameKey: required("AGENT_GAMMA_PRIVATE_KEY"),
    walletKey: required("AGENT_GAMMA_WALLET_PRIVATE_KEY"),
  },
  {
    id: "delta",
    name: "Delta",
    persona: "The chaos agent. Uses odd metaphors and jokes; hard to pin down.",
    accountId: required("AGENT_DELTA_ACCOUNT_ID"),
    gameKey: required("AGENT_DELTA_PRIVATE_KEY"),
    walletKey: required("AGENT_DELTA_WALLET_PRIVATE_KEY"),
  },
];

export const agentById = new Map(agents.map((agent) => [agent.id, agent]));
