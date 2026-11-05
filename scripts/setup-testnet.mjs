#!/usr/bin/env node
/**
 * Create the Testnet account tree for Agent Undercover.
 *
 * Prerequisites:
 *   .keys/parent-key.json  { account_id, public_key, secret_key }
 *     Create the parent with https://helper.testnet.near.org/account
 *     (newAccountId + newAccountPublicKey).
 *
 * Result:
 *   game.<parent>.testnet            contract account, full-access key
 *   alpha/beta/gamma/delta.<parent>  persistent agents, ONLY a scoped
 *                                    FunctionCall key (no full-access key)
 *   .keys/accounts.json              all key material, chmod 600, gitignored
 */
import { Account, JsonRpcProvider, KeyPair, nearToYocto } from "near-api-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEYS_DIR = join(ROOT, ".keys");
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
const CONTRACT_PREFIX = "game";
const AGENTS = ["alpha", "beta", "gamma", "delta"];
const AGENT_BALANCE = nearToYocto("2");
const CONTRACT_BALANCE = nearToYocto("5");
const AGENT_GAS_ALLOWANCE = nearToYocto("0.5");
const AGENT_METHODS = [
  "join_room",
  "submit_description",
  "commit_vote",
  "reveal_vote",
];

const provider = new JsonRpcProvider({ url: RPC_URL });

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeSecretJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}

async function accountExists(accountId) {
  try {
    await new Account(accountId, provider).getState();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const parentPath = join(KEYS_DIR, "parent-key.json");
  if (!existsSync(parentPath)) {
    throw new Error(`Missing ${parentPath}; create the parent account first.`);
  }

  const parentKey = readJson(parentPath);
  const parent = new Account(parentKey.account_id, provider, parentKey.secret_key);
  const parentState = await parent.getState();
  console.log(`parent:   ${parentKey.account_id} (${parentState.balance.available} yocto available)`);

  const contractId = `${CONTRACT_PREFIX}.${parentKey.account_id}`;
  const accountsPath = join(KEYS_DIR, "accounts.json");
  const saved = existsSync(accountsPath) ? readJson(accountsPath) : { agents: {} };

  let contractKey = saved.contract;
  if (!contractKey) {
    const kp = KeyPair.fromRandom("ed25519");
    contractKey = {
      account_id: contractId,
      public_key: kp.getPublicKey().toString(),
      secret_key: kp.toString(),
    };
    saved.contract = contractKey;
    writeSecretJson(accountsPath, saved);
  }

  if (await accountExists(contractId)) {
    console.log(`contract: ${contractId} already exists`);
  } else {
    await parent.createSubAccount({
      accountOrPrefix: CONTRACT_PREFIX,
      publicKey: contractKey.public_key,
      nearToTransfer: CONTRACT_BALANCE,
    });
    console.log(`contract: ${contractId} created with 5 NEAR`);
  }

  for (const name of AGENTS) {
    const agentId = `${name}.${parentKey.account_id}`;
    const existing = saved.agents[name];
    if (existing) {
      console.log(`agent:    ${agentId} already recorded`);
      continue;
    }
    if (await accountExists(agentId)) {
      throw new Error(`${agentId} exists but is not in .keys/accounts.json`);
    }

    const scoped = KeyPair.fromRandom("ed25519");
    const temporary = KeyPair.fromRandom("ed25519");

    await parent.createSubAccount({
      accountOrPrefix: name,
      publicKey: temporary.getPublicKey().toString(),
      nearToTransfer: AGENT_BALANCE,
    });

    const agent = new Account(agentId, provider, temporary.toString());
    await agent.addFunctionCallAccessKey({
      publicKey: scoped.getPublicKey().toString(),
      contractId,
      methodNames: AGENT_METHODS,
      allowance: AGENT_GAS_ALLOWANCE,
    });
    // Remove the temporary full-access key: the agent keeps only the scoped key.
    await agent.deleteKey(temporary.getPublicKey().toString());

    saved.agents[name] = {
      account_id: agentId,
      public_key: scoped.getPublicKey().toString(),
      secret_key: scoped.toString(),
    };
    writeSecretJson(accountsPath, saved);
    console.log(`agent:    ${agentId} created; only a scoped FunctionCall key remains`);
  }

  console.log(`\nwrote ${accountsPath}`);
  console.log(`contract: ${contractId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
