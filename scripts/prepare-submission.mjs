#!/usr/bin/env node
/**
 * Prints the NEAR Hackathon submission payload for human review. It never
 * sends the request. The one-time requestId is saved locally so a retry after
 * a network error or 503 can reuse it.
 *
 * Usage:
 *   node scripts/prepare-submission.mjs \
 *     --project-url https://github.com/<user>/agent-undercover \
 *     --demo-url https://x.com/<user>/status/<id> \
 *     --consent
 */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUEST_ID_PATH = join(ROOT, ".submission-request-id");

const CONSENT_STATEMENT =
  "I agree that the organizers may use these details to review our submission and contact us about this hackathon.";

const VALID_TRACKS = new Set([
  "defi",
  "thesis",
  "privacy",
  "business",
  "swarms",
  "security",
  "agents",
  "realworld",
  "games",
  "nfts",
  "memecoins",
  "social",
  "open",
]);
const VALID_SIZES = new Set(["1", "2 - 4", "4 - 6", "6 - 8", "8+"]);
const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

const { values: args } = parseArgs({
  options: {
    "project-url": { type: "string" },
    "demo-url": { type: "string" },
    consent: { type: "boolean", default: false },
  },
});

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function validateUrl(name, value) {
  if (!value) fail(`--${name} is required`);
  if (value.includes("REPLACE") || value.includes("<")) {
    fail(`--${name} still contains a placeholder: ${value}`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`--${name} is not a valid URL: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    fail(`--${name} must be http(s): ${value}`);
  }
  if (value.length > 300) fail(`--${name} is over 300 characters`);
  return value;
}

async function readIdea() {
  // Single source of truth: the blockquote under PRD §12.5.
  const prd = await readFile(join(ROOT, "prd.md"), "utf8");
  const section = prd.split("### 12.5")[1] ?? "";
  const match = section.match(/^>\s*(.+)$/m);
  if (!match) fail("could not read the idea text from prd.md §12.5");
  return match[1].trim();
}

async function readRequestId() {
  try {
    return (await readFile(REQUEST_ID_PATH, "utf8")).trim();
  } catch {
    const id = randomUUID();
    await writeFile(REQUEST_ID_PATH, `${id}\n`, { mode: 0o600 });
    console.log(`generated requestId ${id} -> .submission-request-id (reused on retries)`);
    return id;
  }
}

const projectUrl = validateUrl("project-url", args["project-url"]);
const demoUrl = validateUrl("demo-url", args["demo-url"]);
const idea = await readIdea();
const requestId = await readRequestId();

const payload = {
  requestId,
  projectName: "Agent Undercover",
  leadName: "Necklace",
  email: "necklace1982@gmail.com",
  size: "1",
  tracks: ["games", "agents", "swarms"],
  nearAddress: "x-bit.near",
  projectUrl,
  demoUrl,
  idea,
  consent: Boolean(args.consent),
};

// Validate every documented field before the human sees a "ready" payload.
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId)) {
  fail(`invalid requestId: ${requestId}`);
}
if (payload.projectName.length < 2 || payload.projectName.length > 80) fail("projectName length");
if (payload.leadName.length < 2 || payload.leadName.length > 80) fail("leadName length");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 160) fail("email");
if (!VALID_SIZES.has(payload.size)) fail("size");
if (payload.tracks.length === 0 || new Set(payload.tracks).size !== payload.tracks.length) {
  fail("tracks must be unique and non-empty");
}
for (const track of payload.tracks) if (!VALID_TRACKS.has(track)) fail(`unknown track ${track}`);
if (payload.nearAddress.length < 2 || payload.nearAddress.length > 64) fail("nearAddress length");
if (!NEAR_ACCOUNT.test(payload.nearAddress)) fail("nearAddress format");
if (idea.length < 20 || idea.length > 2000) fail(`idea length ${idea.length}`);
if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 12_000) fail("body over 12000 bytes");

console.log("\n=== Consent statement (read to the human verbatim) ===");
console.log(`"${CONSENT_STATEMENT}"`);
console.log(`consent is ${payload.consent ? "TRUE" : "FALSE — rerun with --consent after the human agrees"}`);

console.log("\n=== Payload for review (NOT sent) ===");
console.log(JSON.stringify(payload, null, 2));

console.log("\n=== Form fields (https://nearhackathon.com/#apply) ===");
for (const [key, value] of Object.entries(payload)) {
  console.log(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
}

if (payload.consent) {
  console.log("\n=== curl (human runs this only after confirming) ===");
  console.log(
    `curl -sS -X POST https://nearhackathon.com/api/applications \\\n  -H 'Content-Type: application/json' \\\n  --data-binary @- <<'JSON'\n${JSON.stringify(payload)}\nJSON`,
  );
  console.log(
    "\nReuse this same requestId on network errors or 503. A 409 means the repo was already submitted; request changes instead of resubmitting.",
  );
}
