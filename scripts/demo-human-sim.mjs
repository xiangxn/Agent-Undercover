/**
 * M2 headless human: exercises the exact browser flow (session account,
 * create_room, submit_description, commit_vote, reveal_vote) over Socket.IO.
 * Server must be running on localhost:8787.
 */
import { createHash, randomUUID } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, gigaToGas } from "near-api-js";
import { io } from "socket.io-client";

const SERVER = process.env.SERVER_URL ?? "http://localhost:8787";
const socket = io(SERVER, { transports: ["websocket"] });

function emitAck(event, payload, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    socket.emit(event, payload, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  console.log(`[sim] connected to ${SERVER}`);

  const keyPair = KeyPair.fromRandom("ed25519");
  const created = await emitAck("session:create", {
    publicKey: keyPair.getPublicKey().toString(),
  });
  if (!created.ok) throw new Error(created.error);
  const { session } = created;
  console.log(`[sim] session ${session.accountId}`);
  console.log(`[sim] room    ${session.roomId}`);

  const provider = new JsonRpcProvider({ url: `${SERVER}/api/rpc` });
  const account = new Account(session.accountId, provider, keyPair.toString());
  const stake = BigInt(session.stake);
  console.log(`[sim] stake   ${Number(stake) / 1e24} NEAR`);

  const outcome = await account.callFunctionRaw({
    contractId: session.contractId,
    methodName: "create_room",
    args: {
      room_id: session.roomId,
      stake: session.stake,
      max_players: 5,
      impostor_count: 1,
      max_rounds: 3,
    },
    deposit: stake,
    gas: gigaToGas(100_000),
    waitUntil: "FINAL",
  });
  console.log(`[sim] create_room ${outcome.transaction_outcome?.id}`);

  const started = await emitAck("game:start", { roomId: session.roomId });
  if (!started.ok) throw new Error(started.error ?? "game:start failed");

  const acted = { described: new Set(), committed: new Set(), revealed: new Set() };
  let acting = false;
  let pending = null;
  let lastPhase = "";
  let finalResult = null;

  const act = async (snapshot) => {
    if (!snapshot) return;
    if (snapshot.phase !== lastPhase) {
      lastPhase = snapshot.phase;
      console.log(
        `[sim] phase ${snapshot.phase} round ${snapshot.round} pot ${Number(snapshot.pot) / 1e24}`,
      );
    }
    const me = snapshot.players.find((player) => player.account === session.accountId);
    if (!me?.alive) return;

    if (
      snapshot.phase === "describing" &&
      !acted.described.has(snapshot.round)
    ) {
      const already = snapshot.descriptions.some(
        (item) => item.round === snapshot.round && item.account === session.accountId,
      );
      if (!already) {
        await account.callFunctionRaw({
          contractId: session.contractId,
          methodName: "submit_description",
          args: {
            room_id: session.roomId,
            text: "It turns up in ordinary life more often than people admit.",
          },
          deposit: 0n,
          gas: gigaToGas(100_000),
          waitUntil: "FINAL",
        });
        console.log(`[sim] described round ${snapshot.round}`);
      }
      acted.described.add(snapshot.round);
    }

    if (
      snapshot.phase === "votecommit" &&
      !acted.committed.has(snapshot.round)
    ) {
      const targets = snapshot.players.filter(
        (player) => player.alive && player.account !== session.accountId,
      );
      const target = targets[Math.floor(Math.random() * targets.length)];
      const salt = randomUUID();
      pending = { round: snapshot.round, target: target.account, salt, revealed: false };
      await account.callFunctionRaw({
        contractId: session.contractId,
        methodName: "commit_vote",
        args: {
          room_id: session.roomId,
          commitment: sha256(`${target.account}:${salt}`),
        },
        deposit: 0n,
        gas: gigaToGas(100_000),
        waitUntil: "FINAL",
      });
      acted.committed.add(snapshot.round);
      console.log(`[sim] committed vote for ${target.name} (salt kept locally)`);
    }

    if (
      snapshot.phase === "votereveal" &&
      pending &&
      pending.round === snapshot.round &&
      !pending.revealed
    ) {
      pending.revealed = true;
      await account.callFunctionRaw({
        contractId: session.contractId,
        methodName: "reveal_vote",
        args: { room_id: session.roomId, target: pending.target, salt: pending.salt },
        deposit: 0n,
        gas: gigaToGas(100_000),
        waitUntil: "FINAL",
      });
      console.log(`[sim] revealed vote round ${snapshot.round}`);
    }
  };

  socket.on("private", (payload) => {
    console.log(`[sim] private role=${payload.view.role} word="${payload.view.word}"`);
  });

  socket.on("state", (payload) => {
    if (acting) return;
    acting = true;
    void act(payload.snapshot)
      .catch((error) => console.error("[sim] act error", error))
      .finally(() => {
        acting = false;
      });
  });

  socket.on("log", (payload) => {
    console.log(`[chain] ${payload.message}${payload.txHash ? ` (${payload.txHash.slice(0, 10)}…)` : ""}`);
  });

  const finished = new Promise((resolve) => {
    socket.on("result", (payload) => {
      finalResult = payload.result;
      resolve(payload.result);
    });
  });

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timed out waiting for settlement")), 8 * 60 * 1000);
  });
  const result = await Promise.race([finished, timeout]);
  clearTimeout(timeoutId);

  console.log("\n=== RESULT ===");
  console.log(`winning side: ${result.winningSide}`);
  console.log(`winners: ${result.winners.join(", ")}`);
  console.log(`pot: ${Number(result.pot) / 1e24} NEAR`);
  console.log("roles:", result.roles);
  for (const agent of result.agentBalances) {
    const delta = (BigInt(agent.after) - BigInt(agent.before)).toString();
    console.log(
      `  ${agent.name.padEnd(6)} role=${result.roles[agent.accountId]} net=${Number(delta) / 1e24} NEAR stats=${agent.stats.games}/${agent.stats.wins}`,
    );
  }
  console.log("reasoning:", result.thoughts.length, "entries");
  socket.close();
  process.exit(0);
}

main().catch((error) => {
  console.error("[sim] FAILED", error);
  socket.close();
  process.exit(1);
});
