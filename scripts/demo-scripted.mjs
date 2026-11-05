#!/usr/bin/env node
/**
 * Scripted end-to-end game on NEAR Testnet (M1).
 *
 * Real testnet transactions: 5 players stake 0.1 NEAR each, commit and
 * reveal votes, the game master reveals the exiled role, and the contract
 * pays the winners. Agent dialogue is deterministic (no LLM needed).
 *
 * Run: node --env-file=.env scripts/demo-scripted.mjs
 */
import {
  Account,
  JsonRpcProvider,
  gigaToGas,
  nearToYocto,
  yoctoToNear,
} from "near-api-js";
import { createHash, randomUUID } from "node:crypto";

const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
const CONTRACT = process.env.CONTRACT_ACCOUNT_ID;
const GAS = gigaToGas(100_000); // 100 TGas
const STAKE = nearToYocto("0.1");

if (!CONTRACT || !process.env.MASTER_PRIVATE_KEY) {
  throw new Error("Missing .env values (CONTRACT_ACCOUNT_ID / MASTER_PRIVATE_KEY)");
}

const AGENT_NAMES = ["ALPHA", "BETA", "GAMMA", "DELTA"];
const AGENTS = AGENT_NAMES.map((name) => ({
  name: name.toLowerCase(),
  accountId: process.env[`AGENT_${name}_ACCOUNT_ID`],
  gameKey: process.env[`AGENT_${name}_PRIVATE_KEY`],
  walletKey: process.env[`AGENT_${name}_WALLET_PRIVATE_KEY`],
}));
for (const agent of AGENTS) {
  if (!agent.accountId || !agent.gameKey || !agent.walletKey) {
    throw new Error(`Missing keys for agent ${agent.name}`);
  }
}

const provider = new JsonRpcProvider({ url: RPC_URL });
const master = new Account(
  process.env.MASTER_ACCOUNT_ID,
  provider,
  process.env.MASTER_PRIVATE_KEY,
);
const agentAccounts = AGENTS.map((agent) => ({
  ...agent,
  account: new Account(agent.accountId, provider, agent.gameKey),
  wallet: new Account(agent.accountId, provider, agent.walletKey),
}));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const commitment = (value, salt) => sha256(`${value}:${salt}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(account, method, args, deposit = 0n) {
  const response = await account.callFunctionRaw({
    contractId: CONTRACT,
    methodName: method,
    args,
    deposit,
    gas: GAS,
    waitUntil: "FINAL",
  });
  const txId = response.transaction_outcome?.id ?? "sent";
  console.log(`  ${method.padEnd(20)} ${txId}`);
  return txId;
}

/**
 * A FunctionCall key cannot attach a deposit, so the agent calls its own
 * wallet contract, which forwards the fixed stake to join_room.
 */
async function joinWithWallet(agent, roomId) {
  const response = await agent.wallet.callFunctionRaw({
    contractId: agent.accountId,
    methodName: "stake",
    args: { room_id: roomId },
    deposit: 0n,
    gas: GAS,
    waitUntil: "FINAL",
  });
  console.log(
    `  ${"stake -> join_room".padEnd(20)} ${response.transaction_outcome?.id ?? "sent"} (${agent.name})`,
  );

  for (let attempt = 0; attempt < 60; attempt++) {
    const room = await view("get_room", { room_id: roomId });
    if (room.players.some((player) => player.account === agent.accountId)) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`${agent.accountId} did not join the room`);
}

const view = (method, args = {}) =>
  provider.callFunction({ contractId: CONTRACT, method, args });

async function balance(accountId) {
  const state = await new Account(accountId, provider).getState();
  return state.balance.available;
}

async function main() {
  const roomId = `m1-${Date.now()}`;
  const hostId = process.env.MASTER_ACCOUNT_ID;
  const before = {};
  for (const agent of agentAccounts) {
    before[agent.accountId] = await balance(agent.accountId);
  }

  console.log(`\n== Agent Undercover / scripted M1 ==`);
  console.log(`contract ${CONTRACT}`);
  console.log(`room     ${roomId}\n`);

  console.log("lobby");
  await call(master, "create_room", {
    room_id: roomId,
    stake: STAKE.toString(),
    max_players: 5,
    impostor_count: 1,
    max_rounds: 3,
  }, STAKE);
  for (const agent of agentAccounts) {
    await joinWithWallet(agent, roomId);
  }

  // Roles are assigned off-chain; only hashes go on-chain.
  const roles = {
    [hostId]: { role: "impostor", word: "account", salt: randomUUID() },
  };
  for (const agent of agentAccounts) {
    roles[agent.accountId] = { role: "crew", word: "wallet", salt: randomUUID() };
  }
  const roleCommitments = Object.entries(roles).map(([player, value]) => [
    player,
    commitment(value.role, value.salt),
  ]);

  console.log("\nstart");
  await call(master, "start_game", {
    room_id: roomId,
    role_commitments: roleCommitments,
    agent_accounts: agentAccounts.map((agent) => agent.accountId),
  });

  const lines = {
    [hostId]: "You use it to pay for things, and losing it ruins your day.",
    [agentAccounts[0].accountId]:
      "It usually has a seed phrase and lives in your pocket.",
    [agentAccounts[1].accountId]:
      "Mine is mostly empty, but it still signs transactions.",
    [agentAccounts[2].accountId]: "It can be hot, cold, or hardware.",
    [agentAccounts[3].accountId]: "You should never share its private key.",
  };

  console.log("\ndescriptions");
  await call(master, "submit_description", {
    room_id: roomId,
    text: lines[hostId],
  });
  for (const agent of agentAccounts) {
    await call(agent.account, "submit_description", {
      room_id: roomId,
      text: lines[agent.accountId],
    });
  }

  // Everyone suspects the host; the host deflects to alpha.
  const targets = {
    [hostId]: agentAccounts[0].accountId,
  };
  for (const agent of agentAccounts) {
    targets[agent.accountId] = hostId;
  }
  const voteSalts = {};
  for (const player of Object.keys(roles)) {
    voteSalts[player] = randomUUID();
  }

  console.log("\nvote commit");
  await call(master, "commit_vote", {
    room_id: roomId,
    commitment: commitment(targets[hostId], voteSalts[hostId]),
  });
  for (const agent of agentAccounts) {
    await call(agent.account, "commit_vote", {
      room_id: roomId,
      commitment: commitment(targets[agent.accountId], voteSalts[agent.accountId]),
    });
  }

  console.log("\nvote reveal");
  await call(master, "reveal_vote", {
    room_id: roomId,
    target: targets[hostId],
    salt: voteSalts[hostId],
  });
  for (const agent of agentAccounts) {
    await call(agent.account, "reveal_vote", {
      room_id: roomId,
      target: targets[agent.accountId],
      salt: voteSalts[agent.accountId],
    });
  }

  let room = await view("get_room", { room_id: roomId });
  console.log(
    `\ntally: phase=${room.phase} pending_exile=${room.pending_exile ?? "none"}`,
  );
  if (room.pending_exile !== hostId) {
    throw new Error(`Unexpected exile: ${room.pending_exile}`);
  }

  console.log("\nrole reveal + advance");
  await call(master, "reveal_role", {
    room_id: roomId,
    player: hostId,
    role: roles[hostId].role,
    salt: roles[hostId].salt,
  });
  await call(master, "advance", { room_id: roomId });

  room = await view("get_room", { room_id: roomId });
  console.log(`phase=${room.phase} winning_side=${room.winning_side}`);

  console.log("\nsettle");
  const reveals = Object.entries(roles).map(([player, value]) => ({
    player,
    role: value.role,
    salt: value.salt,
  }));
  await call(master, "settle", { room_id: roomId, role_reveals: reveals });

  room = await view("get_room", { room_id: roomId });
  console.log(`phase=${room.phase} winners=${room.winners.length} pot=${room.pot}`);

  console.log("\nagent results");
  for (const agent of agentAccounts) {
    const stats = await view("get_agent_stats", { account: agent.accountId });
    const after = await balance(agent.accountId);
    const delta = after - before[agent.accountId];
    console.log(
      `${agent.name.padEnd(6)} games=${stats.games} wins=${stats.wins} ` +
        `earnings=${yoctoToNear(BigInt(stats.earnings_yocto))} NEAR ` +
        `balance_delta=${yoctoToNear(delta)} NEAR`,
    );
  }

  const round = await view("get_round", { room_id: roomId, round: 1 });
  console.log(`\ndescriptions on-chain: ${round.descriptions.length}`);
  console.log(`votes revealed:       ${round.votes.length}`);
  console.log(
    `explorer: https://testnet.nearblocks.io/address/${CONTRACT}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
