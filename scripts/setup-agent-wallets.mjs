#!/usr/bin/env node
/**
 * Create the v2 persistent agent accounts and deploy the stake-only wallet
 * contract on each of them.
 *
 * Why a wallet contract: a NEAR FunctionCall access key cannot attach a
 * deposit, so an agent cannot call a payable `join_room` directly. The agent
 * account instead holds a tiny contract whose only spending method forwards
 * the fixed stake to the game contract. The account keeps two scoped
 * FunctionCall keys and no full-access key:
 *
 *   game key   -> game.agent-undercover.testnet
 *                 submit_description / commit_vote / reveal_vote
 *   wallet key -> <agent>.agents.agent-undercover.testnet
 *                 stake
 *
 * Result:
 *   alpha/beta/gamma/delta.agents.agent-undercover.testnet
 *   .keys/accounts.json (mode 600, gitignored)
 */
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  actions,
  gigaToGas,
  nearToYocto,
} from "near-api-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEYS_DIR = join(ROOT, ".keys");
const WALLET_WASM = join(
  ROOT,
  "contract/agent-wallet/target/wasm32-unknown-unknown/release/agent_undercover_wallet.wasm",
);
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
const NAMES = ["alpha", "beta", "gamma", "delta"];
const GAS_ALLOWANCE = nearToYocto("0.5");
const STAKE = nearToYocto("0.1");
const AGENT_BALANCE = nearToYocto("2.4");
const AGENT_PARENT_BALANCE = nearToYocto("9.8");

const provider = new JsonRpcProvider({ url: RPC_URL });

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeSecretJson = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });

async function accountExists(accountId) {
  try {
    const state = await new Account(accountId, provider).getState();
    return state;
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(WALLET_WASM)) {
    throw new Error(`Missing ${WALLET_WASM}; build the wallet contract first.`);
  }
  const walletCode = readFileSync(WALLET_WASM);

  const parentKey = readJson(join(KEYS_DIR, "parent-key.json"));
  const funderKey = readJson(join(KEYS_DIR, "funder-key.json"));
  const accountsPath = join(KEYS_DIR, "accounts.json");
  const saved = readJson(accountsPath);
  const contractId = saved.contract.account_id;

  const parent = new Account(parentKey.account_id, provider, parentKey.secret_key);
  const funder = new Account(funderKey.account_id, provider, funderKey.secret_key);

  // 1. agents.agent-undercover.testnet
  const agentParentId = `agents.${parentKey.account_id}`;
  let agentParentKey = saved.agent_parent;
  if (!agentParentKey) {
    if (await accountExists(agentParentId)) {
      throw new Error(`${agentParentId} exists but no key is recorded`);
    }
    const parentBalance = (await parent.getState()).balance.available;
    if (parentBalance < AGENT_PARENT_BALANCE + nearToYocto("0.1")) {
      const topUp = AGENT_PARENT_BALANCE + nearToYocto("0.1") - parentBalance;
      console.log(`funding parent with ${topUp} yocto from ${funderKey.account_id}`);
      await funder.signAndSendTransaction({
        receiverId: parentKey.account_id,
        actions: [actions.transfer(topUp)],
        waitUntil: "FINAL",
      });
    }
    const kp = KeyPair.fromRandom("ed25519");
    await parent.createSubAccount({
      accountOrPrefix: "agents",
      publicKey: kp.getPublicKey().toString(),
      nearToTransfer: AGENT_PARENT_BALANCE,
    });
    agentParentKey = {
      account_id: agentParentId,
      public_key: kp.getPublicKey().toString(),
      secret_key: kp.toString(),
    };
    saved.agent_parent = agentParentKey;
    writeSecretJson(accountsPath, saved);
    console.log(`created ${agentParentId}`);
  }

  const agentParent = new Account(
    agentParentKey.account_id,
    provider,
    agentParentKey.secret_key,
  );

  // 2. agents + wallet contract
  for (const name of NAMES) {
    const agentId = `${name}.${agentParentId}`;
    if (saved.agents_v2?.[name]) {
      console.log(`agent ${agentId} already recorded`);
      continue;
    }

    let pending = saved.agents_v2_pending?.[name];
    if (!pending) {
      const existing = await accountExists(agentId);
      if (existing) {
        throw new Error(
          `${agentId} already exists (codeHash ${existing.codeHash}) but has no recorded key`,
        );
      }

      const temporary = KeyPair.fromRandom("ed25519");
      console.log(`creating ${agentId}`);
      await agentParent.createSubAccount({
        accountOrPrefix: name,
        publicKey: temporary.getPublicKey().toString(),
        nearToTransfer: AGENT_BALANCE,
      });

      pending = {
        account_id: agentId,
        temp_secret_key: temporary.toString(),
        game_secret_key: KeyPair.fromRandom("ed25519").toString(),
        wallet_secret_key: KeyPair.fromRandom("ed25519").toString(),
        deployed: false,
        initialized: false,
        game_key_added: false,
        wallet_key_added: false,
      };
      saved.agents_v2_pending ??= {};
      saved.agents_v2_pending[name] = pending;
      writeSecretJson(accountsPath, saved);
    }

    const agent = new Account(agentId, provider, pending.temp_secret_key);
    const gameKey = KeyPair.fromString(pending.game_secret_key);
    const walletKey = KeyPair.fromString(pending.wallet_secret_key);

    if (!pending.deployed) {
      console.log(`  deploying wallet (${walletCode.length} bytes)`);
      await agent.signAndSendTransaction({
        receiverId: agentId,
        actions: [actions.deployContract(walletCode)],
        waitUntil: "FINAL",
      });
      pending.deployed = true;
      writeSecretJson(accountsPath, saved);
    }

    if (!pending.initialized) {
      console.log(`  initializing wallet`);
      await agent.signAndSendTransaction({
        receiverId: agentId,
        actions: [
          actions.functionCall(
            "new",
            { game_contract: contractId, stake: STAKE.toString() },
            gigaToGas(100_000),
            0n,
          ),
        ],
        waitUntil: "FINAL",
      });
      pending.initialized = true;
      writeSecretJson(accountsPath, saved);
    }

    if (!pending.game_key_added) {
      console.log(`  adding game key`);
      await agent.addFunctionCallAccessKey({
        publicKey: gameKey.getPublicKey().toString(),
        contractId,
        methodNames: ["submit_description", "commit_vote", "reveal_vote"],
        allowance: GAS_ALLOWANCE,
      });
      pending.game_key_added = true;
      writeSecretJson(accountsPath, saved);
    }

    if (!pending.wallet_key_added) {
      console.log(`  adding wallet key`);
      await agent.addFunctionCallAccessKey({
        publicKey: walletKey.getPublicKey().toString(),
        contractId: agentId,
        methodNames: ["stake"],
        allowance: GAS_ALLOWANCE,
      });
      pending.wallet_key_added = true;
      writeSecretJson(accountsPath, saved);
    }

    await agent.deleteKey(
      KeyPair.fromString(pending.temp_secret_key).getPublicKey().toString(),
    );

    saved.agents_v2 ??= {};
    saved.agents_v2[name] = {
      account_id: agentId,
      game_public_key: gameKey.getPublicKey().toString(),
      game_secret_key: pending.game_secret_key,
      wallet_public_key: walletKey.getPublicKey().toString(),
      wallet_secret_key: pending.wallet_secret_key,
    };
    delete saved.agents_v2_pending[name];
    writeSecretJson(accountsPath, saved);
    console.log(`  ${agentId}: two scoped keys, no full-access key`);
  }

  console.log(`\nwrote ${accountsPath}`);
  console.log(`contract ${contractId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
