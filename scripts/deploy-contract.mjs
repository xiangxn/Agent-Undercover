#!/usr/bin/env node
/**
 * Deploy the Agent Undercover contract and initialize it.
 *
 * Reads .keys/accounts.json (contract key) and .keys/parent-key.json
 * (the parent account is the game master).
 */
import {
  Account,
  JsonRpcProvider,
  actions,
  gigaToGas,
} from "near-api-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM = join(
  ROOT,
  "contract/target/wasm32-unknown-unknown/release/agent_undercover_contract.wasm",
);
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";

const provider = new JsonRpcProvider({ url: RPC_URL });
const saved = JSON.parse(readFileSync(join(ROOT, ".keys/accounts.json"), "utf8"));
const parentKey = JSON.parse(readFileSync(join(ROOT, ".keys/parent-key.json"), "utf8"));
const contractId = saved.contract.account_id;
const gameMaster = parentKey.account_id;

if (!existsSync(WASM)) {
  throw new Error(`Missing ${WASM}; run "pnpm build:contract" first.`);
}

const account = new Account(contractId, provider, saved.contract.secret_key);

console.log(`deploying ${WASM}`);
const deploy = await account.signAndSendTransaction({
  receiverId: contractId,
  actions: [actions.deployContract(readFileSync(WASM))],
  waitUntil: "FINAL",
});
console.log(`deploy tx: ${deploy.transaction_outcome?.id ?? "sent"}`);

const view = (method, args = {}) =>
  provider.callFunction({ contractId, method, args });

let initialized = false;
try {
  await view("get_game_master");
  initialized = true;
} catch {
  // Not initialized yet.
}

if (!initialized) {
  const init = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [
      actions.functionCall(
        "new",
        { game_master: gameMaster },
        gigaToGas(100_000),
        0n,
      ),
    ],
    waitUntil: "FINAL",
  });
  console.log(`init tx:   ${init.transaction_outcome?.id ?? "sent"}`);
} else {
  console.log("init:      already initialized, skipped");
}

const state = await account.getState();
const master = await view("get_game_master");
const roomCount = await view("get_room_count");

console.log(`contract:  ${contractId}`);
console.log(`game master: ${master}`);
console.log(`room count:  ${roomCount}`);
console.log(`code hash:   ${state.codeHash}`);
