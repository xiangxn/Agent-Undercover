import {
  Account,
  JsonRpcProvider,
  KeyPair,
  actions,
  gigaToGas,
  nearToYocto,
} from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { createHash, randomUUID } from "node:crypto";
import type {
  AgentStats,
  ChainRoom,
  ChainRound,
  Role,
} from "@agent-undercover/shared";
import { agentById, agents, config, type AgentConfig } from "./config.js";

export const GAS = gigaToGas(100_000);
export const STAKE = BigInt(config.stakeYocto);

export const provider = new JsonRpcProvider({ url: config.rpcUrl });
export const master = new Account(
  config.masterAccountId,
  provider,
  config.masterPrivateKey as KeyPairString,
);
export const treasury = new Account(
  config.treasuryAccountId,
  provider,
  config.treasuryPrivateKey as KeyPairString,
);

const gameAccounts = new Map(
  agents.map((agent) => [
    agent.id,
    new Account(agent.accountId, provider, agent.gameKey as KeyPairString),
  ]),
);
const walletAccounts = new Map(
  agents.map((agent) => [
    agent.id,
    new Account(agent.accountId, provider, agent.walletKey as KeyPairString),
  ]),
);

export function gameAccount(agentId: string): Account {
  const account = gameAccounts.get(agentId as AgentConfig["id"]);
  if (!account) throw new Error(`Unknown agent ${agentId}`);
  return account;
}

export function walletAccount(agentId: string): Account {
  const account = walletAccounts.get(agentId as AgentConfig["id"]);
  if (!account) throw new Error(`Unknown agent ${agentId}`);
  return account;
}

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({
    contractId: config.contractId,
    method,
    args,
  })) as T;
}

export interface TxInfo {
  hash: string;
  method: string;
  account?: string;
}

export async function call(
  account: Account,
  receiverId: string,
  method: string,
  args: Record<string, unknown> = {},
  deposit: bigint = 0n,
): Promise<TxInfo> {
  const result = await withTimeout(
    account.callFunctionRaw({
      contractId: receiverId,
      methodName: method,
      args,
      deposit,
      gas: GAS,
      waitUntil: "INCLUDED",
    }),
    30_000,
    method,
  ).catch((error: unknown) => {
    const data = (error as { data?: unknown }).data;
    console.error(
      `[near] ${method} failed on ${receiverId} (${account.accountId})`,
      error instanceof Error ? error.message : String(error),
      data ? JSON.stringify(data).slice(0, 2000) : "",
    );
    throw error;
  });
  return {
    hash: result.transaction_outcome?.id ?? "sent",
    method,
    account: account.accountId,
  };
}

export async function getRoom(roomId: string): Promise<ChainRoom> {
  return view<ChainRoom>("get_room", { room_id: roomId });
}

export async function getRound(roomId: string, round: number): Promise<ChainRound> {
  return view<ChainRound>("get_round", { room_id: roomId, round });
}

export async function getAgentStats(accountId: string): Promise<AgentStats> {
  return view<AgentStats>("get_agent_stats", { account: accountId });
}

export async function balanceYocto(accountId: string): Promise<bigint> {
  const state = await new Account(accountId, provider).getState();
  return BigInt(state.balance.available);
}

export function commitment(value: string, salt: string): string {
  return createHash("sha256").update(`${value}:${salt}`).digest("hex");
}

export function randomSalt(): string {
  return randomUUID();
}

export async function createSessionAccount(publicKey: string): Promise<string> {
  // A public hosted demo shares one Testnet treasury. Check the budget before
  // creating a subaccount, otherwise accounts are minted that cannot be funded.
  const [treasuryBalance, masterBalance] = await Promise.all([
    balanceYocto(config.treasuryAccountId),
    balanceYocto(config.masterAccountId),
  ]);
  if (treasuryBalance < nearToYocto(config.treasuryFloorNear as `${number}`)) {
    throw new Error(
      "The demo treasury is low, so new games are paused. Try again later.",
    );
  }
  if (masterBalance < nearToYocto("0.1")) {
    throw new Error(
      "The demo is low on Testnet funds for new sessions. Try again later.",
    );
  }
  const prefix = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // The master only pays account storage; the treasury funds the playable balance
  // so repeated demos do not drain the game-master account.
  await withTimeout(
    master.createSubAccount({
      accountOrPrefix: prefix,
      publicKey,
      nearToTransfer: nearToYocto("0.02"),
    }),
    45_000,
    "createSessionAccount",
  );
  const accountId = `${prefix}.${config.masterAccountId}`;
  await withTimeout(
    treasury.signAndSendTransaction({
      receiverId: accountId,
      actions: [
        actions.transfer(nearToYocto(config.sessionFundingNear as `${number}`)),
      ],
      waitUntil: "EXECUTED_OPTIMISTIC",
    }),
    45_000,
    "fundSession",
  );
  return accountId;
}

/** Keep a disposable human session account able to pay the next stake. */
export async function ensureSessionFunded(accountId: string): Promise<void> {
  const available = await balanceYocto(accountId);
  // stake + a few function calls
  const needed = STAKE + nearToYocto("0.03");
  if (available >= needed) return;
  const amount = nearToYocto(config.sessionTopUpNear as `${number}`);
  await withTimeout(
    treasury.signAndSendTransaction({
      receiverId: accountId,
      actions: [actions.transfer(amount)],
      waitUntil: "EXECUTED_OPTIMISTIC",
    }),
    45_000,
    "topUpSession",
  );
}

/** Refill an agent wallet so the demo can run another game. */
export async function ensureAgentFunded(agent: AgentConfig): Promise<void> {
  const available = await balanceYocto(agent.accountId);
  if (available >= nearToYocto(config.agentMinBalanceNear as `${number}`)) return;
  const amount = nearToYocto(config.agentTopUpNear as `${number}`);
  await withTimeout(treasury.signAndSendTransaction({
    receiverId: agent.accountId,
    actions: [actions.transfer(amount)],
    waitUntil: "EXECUTED_OPTIMISTIC",
  }), 45_000, "topUpAgent");
}

export async function joinViaWallet(agent: AgentConfig, roomId: string): Promise<TxInfo> {
  const wallet = walletAccount(agent.id);
  const result = await withTimeout(
    wallet.callFunctionRaw({
      contractId: agent.accountId,
      methodName: "stake",
      args: { room_id: roomId },
      deposit: 0n,
      gas: GAS,
      waitUntil: "INCLUDED",
    }),
    30_000,
    "stake",
  );
  return {
    hash: result.transaction_outcome?.id ?? "sent",
    method: "stake",
    account: agent.accountId,
  };
}

export async function submitDescription(
  agentId: string,
  roomId: string,
  text: string,
): Promise<TxInfo> {
  return call(gameAccount(agentId), config.contractId, "submit_description", {
    room_id: roomId,
    text,
  });
}

export async function commitVote(
  agentId: string,
  roomId: string,
  hash: string,
): Promise<TxInfo> {
  return call(gameAccount(agentId), config.contractId, "commit_vote", {
    room_id: roomId,
    commitment: hash,
  });
}

export async function revealVote(
  agentId: string,
  roomId: string,
  target: string,
  salt: string,
): Promise<TxInfo> {
  return call(gameAccount(agentId), config.contractId, "reveal_vote", {
    room_id: roomId,
    target,
    salt,
  });
}

export async function startGame(
  roomId: string,
  commitments: [string, string][],
  agentAccounts: string[],
): Promise<TxInfo> {
  return call(master, config.contractId, "start_game", {
    room_id: roomId,
    role_commitments: commitments,
    agent_accounts: agentAccounts,
  });
}

export async function revealRole(
  roomId: string,
  player: string,
  role: Role,
  salt: string,
): Promise<TxInfo> {
  return call(master, config.contractId, "reveal_role", {
    room_id: roomId,
    player,
    role,
    salt,
  });
}

export async function advance(roomId: string): Promise<TxInfo> {
  return call(master, config.contractId, "advance", { room_id: roomId });
}

export async function settle(
  roomId: string,
  reveals: { player: string; role: Role; salt: string }[],
): Promise<TxInfo> {
  return call(master, config.contractId, "settle", {
    room_id: roomId,
    role_reveals: reveals,
  });
}

export async function forceAdvance(roomId: string): Promise<TxInfo> {
  return call(master, config.contractId, "force_advance", { room_id: roomId });
}

export function agentConfig(agentId: string): AgentConfig {
  const agent = agentById.get(agentId as AgentConfig["id"]);
  if (!agent) throw new Error(`Unknown agent ${agentId}`);
  return agent;
}

export function publicKeyOf(secretKey: string): string {
  return KeyPair.fromString(secretKey as KeyPairString).getPublicKey().toString();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
