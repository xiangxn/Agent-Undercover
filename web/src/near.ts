import {
  Account,
  JsonRpcProvider,
  KeyPair,
  gigaToGas,
  type KeyPairString,
} from "near-api-js";
import type { SessionInfo } from "@agent-undercover/shared";

export function createKeyPair(): KeyPair {
  return KeyPair.fromRandom("ed25519");
}

export function makeAccount(session: SessionInfo, secretKey: string): Account {
  const rpc = new URL(session.rpcUrl, window.location.origin).toString();
  const provider = new JsonRpcProvider({ url: rpc });
  return new Account(session.accountId, provider, secretKey as KeyPairString);
}

export interface CallOptions {
  contractId: string;
  methodName: string;
  args?: Record<string, unknown>;
  deposit?: bigint;
}

export async function call(
  account: Account,
  options: CallOptions,
): Promise<Awaited<ReturnType<Account["callFunctionRaw"]>>> {
  const promise = account.callFunctionRaw({
    contractId: options.contractId,
    methodName: options.methodName,
    args: options.args ?? {},
    deposit: options.deposit ?? 0n,
    gas: gigaToGas(100_000),
    // NONE returns before FastNear broadcasts the transaction, which can lose
    // the call entirely. INCLUDED is the slowest but reliable mode.
    waitUntil: "INCLUDED",
  });
  // The transaction may already be in flight; fail fast so the UI can retry
  // instead of waiting forever on a stuck RPC response.
  const outcome = await withTimeout(promise, 30_000, options.methodName);
  console.log("[tx]", options.methodName, (outcome as { transaction_outcome?: { id?: string } })?.transaction_outcome?.id ?? "no-hash");
  return outcome;
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

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function randomSalt(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface ChainRoomView {
  id: string;
  host: string;
  phase: string;
  round: number;
  phase_deadline: number;
}

export interface ChainRoundView {
  round: number;
  descriptions: [string, string][];
  votes: [string, string][];
}

export async function viewRoom(
  account: Account,
  contractId: string,
  roomId: string,
): Promise<ChainRoomView | null> {
  try {
    return (await withTimeout(
      account.provider.callFunction({
        contractId,
        method: "get_room",
        args: { room_id: roomId },
      }),
      8_000,
      "get_room",
    )) as ChainRoomView;
  } catch {
    return null;
  }
}

export async function viewRound(
  account: Account,
  contractId: string,
  roomId: string,
  round: number,
): Promise<ChainRoundView | null> {
  try {
    return (await withTimeout(
      account.provider.callFunction({
        contractId,
        method: "get_round",
        args: { room_id: roomId, round },
      }),
      8_000,
      "get_round",
    )) as ChainRoundView;
  } catch {
    return null;
  }
}

/** Poll until the check returns a value or the timeout expires. */
export async function pollFor<T>(
  check: () => Promise<T | null>,
  timeoutMs = 15_000,
): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await check().catch(() => null);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return null;
}
