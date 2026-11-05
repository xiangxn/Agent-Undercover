import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Role } from "@agent-undercover/shared";
import { config, type AgentConfig } from "../config.js";
import { WORD_PAIRS } from "./words.js";

export interface SeatInfo {
  account: string;
  name: string;
  isAgent: boolean;
  agentId?: string;
  role: Role;
}

export interface HistoryLine {
  round: number;
  name: string;
  text: string;
}

export interface TurnInput {
  agent: AgentConfig;
  role: Role;
  word: string;
  round: number;
  history: HistoryLine[];
  alive: SeatInfo[];
  allSeats: SeatInfo[];
}

export interface TurnDecision {
  description: string;
  target: string;
  reasoning: string;
  source: "ai" | "scripted";
}

const clueMap = new Map<string, string[]>();
for (const pair of WORD_PAIRS) {
  clueMap.set(pair.crew, pair.clues.crew);
  clueMap.set(pair.impostor, pair.clues.impostor);
}

export async function decideTurn(input: TurnInput): Promise<TurnDecision> {
  if (config.demoMode === "scripted" || !config.nearAiApiKey) {
    return scriptedDecision(input);
  }

  // Three attempts: a reasoning model occasionally spends the whole answer on
  // hidden thought, names a dead suspect, or slips its own word into the line.
  let correction =
    "Your previous answer was invalid. Return valid JSON and a valid living target account.";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await callNearAi(input, attempt === 0 ? undefined : correction);
      const result = parseDecision(raw, input);
      if (result.ok) {
        await logTurn(input, raw, result.decision);
        return result.decision;
      }
      correction = `Your previous answer was invalid: ${result.error}. Return valid JSON matching the schema. The description must not contain your secret word; the suspect must be a living player other than you.`;
      await logTurn(input, `INVALID: ${raw}`, null);
    } catch (error) {
      await logTurn(input, `ERROR: ${String(error)}`, null);
      if (attempt === 2) break;
    }
  }
  const fallback = scriptedDecision(input);
  // Record fallbacks too: during a recorded live demo they are still visible
  // as "thinking (scripted)" in the chain feed, and the log says why.
  await logTurn(input, "FALLBACK: scripted", fallback);
  return fallback;
}

function systemPrompt(input: TurnInput): string {
  const roleLine =
    input.role === "impostor"
      ? `You are the IMPOSTOR. Your word is similar to the crew's word, but you do not know theirs. Blend in, mirror the room's confidence, and deflect suspicion without over-explaining. Never say your word.`
      : `You are CREW. Find the impostor from contradictions in the public descriptions. Never say your word.`;

  return [
    `You are ${input.agent.name}, a player in Undercover. Persona: ${input.agent.persona}`,
    `Rules: 5 players, exactly one impostor. Crew share one secret word; the impostor gets a similar word. Each round every living player says ONE public sentence describing their own word without saying it. Then everyone votes to exile one suspect.`,
    roleLine,
    `Your secret word: "${input.word}".`,
    `Current round: ${input.round}. Living players: ${input.alive
      .map((seat) => `${seat.name} (${seat.account})`)
      .join(", ")}.`,
    `Reply with JSON only: {"description": "one natural sentence, max 25 words, never contains your word", "suspect": "<account id of a living player other than yourself>", "reasoning": "one or two private sentences explaining your read"}.`,
  ].join("\n");
}

function userPrompt(input: TurnInput): string {
  if (input.history.length === 0) {
    return "No public descriptions yet. You speak first. Make a confident, specific sentence that gives the room something to read into.";
  }
  return [
    "Public descriptions so far:",
    ...input.history.map(
      (line) => `Round ${line.round} — ${line.name}: ${line.text}`,
    ),
    "Use the contradictions, not private knowledge. Pick a living suspect.",
  ].join("\n");
}

async function callNearAi(input: TurnInput, correction?: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${config.nearAiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.nearAiApiKey}`,
      },
      body: JSON.stringify({
        model: config.nearAiModel,
        temperature: 0.9,
        max_tokens: 320,
        ...(config.nearAiReasoningEffort
          ? { reasoning_effort: config.nearAiReasoningEffort }
          : {}),
        messages: [
          { role: "system", content: systemPrompt(input) },
          {
            role: "user",
            content: correction
              ? `${userPrompt(input)}\n\n${correction}`
              : userPrompt(input),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`NEAR AI ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("NEAR AI returned no content");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ParseResult =
  | { ok: true; decision: TurnDecision }
  | { ok: false; error: string };

function parseDecision(raw: string, input: TurnInput): ParseResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, error: "the answer was not JSON" };
  }
  let value: { description?: unknown; suspect?: unknown; reasoning?: unknown };
  try {
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, error: "the answer was not valid JSON" };
  }
  if (typeof value.description !== "string") {
    return { ok: false, error: "description was missing" };
  }
  const description = value.description.trim().replace(/\s+/g, " ");
  if (!description) return { ok: false, error: "description was empty" };
  if (Buffer.byteLength(description, "utf8") > 280) {
    return { ok: false, error: "description was longer than 280 bytes" };
  }
  // Substring matching rejected innocent words that contain the secret word
  // ("communicates" contains "cat"), which burned retries and fell back to
  // scripted. Match the word as a whole word instead.
  const secretWord = new RegExp(
    `\\b${escapeRegExp(input.word)}\\b`,
    "i",
  );
  if (secretWord.test(description)) {
    return { ok: false, error: "the description contained the secret word" };
  }

  // Models sometimes answer "Necklace (smw3...testnet)" instead of the bare
  // account. Accept an account substring or a display name, not just an exact
  // match, so a good answer is not thrown away on formatting.
  const rawSuspect = typeof value.suspect === "string" ? value.suspect.trim() : "";
  const suspectLower = rawSuspect.toLowerCase();
  const byAccount = input.alive.find((seat) => rawSuspect.includes(seat.account));
  const byName = input.alive.find((seat) => {
    const name = seat.name.toLowerCase();
    return (
      suspectLower === name ||
      suspectLower.startsWith(`${name} `) ||
      suspectLower.startsWith(`${name}(`) ||
      suspectLower === `${name}s`
    );
  });
  const target = byAccount?.account ?? byName?.account ?? "";
  if (!target) return { ok: false, error: "the suspect was not a living player" };
  if (target === input.agent.accountId) {
    return { ok: false, error: "the suspect was the agent itself" };
  }

  return {
    ok: true,
    decision: {
      description,
      target,
      reasoning:
        typeof value.reasoning === "string"
          ? value.reasoning.trim()
          : "Private read unavailable.",
      source: "ai",
    },
  };
}

function scriptedDecision(input: TurnInput): TurnDecision {
  const name = input.agent.name;
  const clues = clueMap.get(input.word) ?? ["it is hard to describe without giving it away"];
  const clue = clues[(input.round + name.length) % clues.length];
  const description = scriptedLine(name, clue);

  const alive = input.alive.filter((seat) => seat.account !== input.agent.accountId);
  let target: SeatInfo | undefined;
  if (input.round === 1) {
    // Create a wrong exile first, so the scripted game has a second act.
    target =
      alive.find((seat) => seat.isAgent && seat.role === "crew") ?? alive[0];
  } else {
    const impostor = alive.find((seat) => seat.role === "impostor");
    target = impostor ?? alive[0];
  }
  if (!target) target = input.allSeats.find((seat) => seat.account !== input.agent.accountId);

  return {
    description,
    target: target?.account ?? input.alive[0]?.account ?? input.agent.accountId,
    reasoning:
      input.round === 1
        ? `${target?.name ?? "Someone"}'s line is the least anchored. I want to see a role flip before I commit to a deeper theory.`
        : `The room's pattern now points at ${target?.name ?? "the quiet seat"}. I'm locking it in.`,
    source: "scripted",
  };
}

function scriptedLine(name: string, clue: string): string {
  const sentence = `${clue[0].toUpperCase()}${clue.slice(1)}.`;
  switch (name) {
    case "Alpha":
      return `One detail stands out: ${sentence} That is what I would test first.`;
    case "Beta":
      return `I'll push back on the easy read. ${sentence} Fight me.`;
    case "Gamma":
      return `Fair point from the room. Building on it: ${sentence}`;
    case "Delta":
      return `Picture this: ${sentence} Make of that what you will.`;
    default:
      return sentence;
  }
}

async function logTurn(
  input: TurnInput,
  raw: string,
  decision: TurnDecision | null,
): Promise<void> {
  try {
    await mkdir(config.runsDir, { recursive: true });
    const path = join(config.runsDir, `${input.agent.id}.jsonl`);
    await appendFile(
      path,
      JSON.stringify({
        at: new Date().toISOString(),
        round: input.round,
        role: input.role,
        word: input.word,
        raw,
        decision,
      }) + "\n",
    );
  } catch {
    // Logging must never break a game.
  }
}
