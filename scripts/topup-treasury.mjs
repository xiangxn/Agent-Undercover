/**
 * Top up the Testnet treasury from the NEAR helper faucet.
 *
 * The helper only funds *new* accounts, so this creates a throwaway account,
 * waits for the credit, then deletes it with the treasury as beneficiary. The
 * remaining balance is swept to the treasury and the temp key never leaves
 * memory except for the few seconds spent waiting on the faucet.
 *
 *   node scripts/topup-treasury.mjs
 *
 * Set HTTPS_PROXY if the helper is not reachable directly (e.g.
 * http://127.0.0.1:1087). The helper gives roughly 10 NEAR per account.
 */
import { Account, JsonRpcProvider, KeyPair } from "near-api-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TREASURY = process.env.TREASURY_ACCOUNT_ID ?? "au-treasury.testnet";
if (!TREASURY.endsWith(".testnet")) {
  throw new Error(`refusing to sweep into non-testnet account ${TREASURY}`);
}

// The server's .env is the source of truth for the RPC endpoint.
function rpcUrl() {
  if (process.env.NEAR_RPC_URL) return process.env.NEAR_RPC_URL;
  if (existsSync(".env")) {
    const match = readFileSync(".env", "utf8").match(/^NEAR_RPC_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  return "https://test.rpc.fastnear.com";
}

const provider = new JsonRpcProvider({ url: rpcUrl() });
const proxy =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;
const key = KeyPair.fromRandom("ed25519");
const id = `au-topup-${Date.now().toString(36)}.testnet`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const curlArgs = [
  "-sS",
  ...(proxy ? ["--proxy", proxy] : []),
  "-X",
  "POST",
  "https://helper.testnet.near.org/account",
  "-H",
  "content-type: application/json",
  "-d",
  JSON.stringify({
    newAccountId: id,
    newAccountPublicKey: key.getPublicKey().toString(),
  }),
];
const body = JSON.parse(
  execFileSync("curl", curlArgs, { encoding: "utf8" }) || "{}",
);
if (body?.status?.Failure) {
  throw new Error(`helper refused ${id}: ${JSON.stringify(body.status.Failure)}`);
}
console.log(`helper created ${id}`);

let balance = 0n;
for (let attempt = 0; attempt < 40 && balance === 0n; attempt++) {
  try {
    const state = await new Account(id, provider).getState();
    balance = BigInt(state.balance.available);
  } catch {
    // The helper may answer before the account is visible on the RPC node.
  }
  if (balance === 0n) await sleep(1500);
}
if (balance === 0n) throw new Error(`${id} was funded but never appeared on chain`);
console.log(`balance ${Number(balance) / 1e24} NEAR`);

const result = await new Account(id, provider, key.toString()).deleteAccount(TREASURY);
console.log(`swept to ${TREASURY} tx=${result.transaction.hash}`);
