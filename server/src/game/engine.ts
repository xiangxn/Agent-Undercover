import { randomInt, randomUUID } from "node:crypto";
import type { Server as IOServer } from "socket.io";
import type {
  AgentBalanceView,
  AgentStats,
  AgentThought,
  ChainRoom,
  DescriptionView,
  GameResultView,
  GameSnapshot,
  PlayerView,
  PrivatePlayerView,
  Role,
  Side,
  VoteView,
} from "@agent-undercover/shared";
import { agents, config } from "../config.js";
import {
  advance,
  agentConfig,
  balanceYocto,
  commitment,
  commitVote,
  ensureAgentFunded,
  ensureSessionFunded,
  forceAdvance,
  getAgentStats,
  getRoom,
  getRound,
  joinViaWallet,
  revealRole,
  revealVote,
  settle,
  startGame,
  submitDescription,
} from "../near.js";
import { decideTurn, type HistoryLine, type SeatInfo, type TurnDecision } from "./ai.js";
import { pickWordPair, type WordPair } from "./words.js";

interface Seat {
  account: string;
  name: string;
  isAgent: boolean;
  agentId?: string;
  role: Role;
  word: string;
  salt: string;
  alive: boolean;
}

interface RoundState {
  decisions: Map<string, TurnDecision>;
  /** The exact target that was committed, which may differ from the AI's pick. */
  commitTargets: Map<string, string>;
  salts: Map<string, string>;
  submitted: Set<string>;
  committed: Set<string>;
  revealed: Set<string>;
  roleAdvanced: boolean;
  settled: boolean;
}

interface CachedRound {
  descriptions: Map<string, string>;
  votes: Map<string, string>;
}

const HUMAN_NAME = process.env.HUMAN_NAME ?? "Necklace";
// The contract allows anyone to force a phase after its deadline. Give the
// human (and slow Testnet transactions) extra slack before the engine does so.
const FORCE_GRACE_SECONDS = 75;
const ACTIVE_PHASES = new Set(["describing", "votecommit", "votereveal", "rolereveal"]);

const DEFAULT_STATS: AgentStats = {
  games: 0,
  wins: 0,
  losses: 0,
  earnings_yocto: "0",
  last_played: 0,
};

export class GameSession {
  readonly roomId: string;
  private readonly io: IOServer;
  private readonly humanAccount: string;
  private humanSocketId: string;

  private seats: Seat[] = [];
  private pair: WordPair | null = null;
  private roles = new Map<string, Role>();
  private roleSalts = new Map<string, string>();
  private rounds = new Map<number, RoundState>();
  private roundCache = new Map<number, CachedRound>();
  private beforeBalances = new Map<string, bigint>();
  private thoughts: AgentThought[] = [];
  private result: GameResultView | null = null;
  private potBeforeSettle: string | null = null;
  private lastStateJson = "";
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private done = false;
  private startPromise: Promise<void> | null = null;
  private lastForceKey = "";
  private lastLoggedPhase = "";

  constructor(io: IOServer, roomId: string, humanAccount: string, humanSocketId: string) {
    this.io = io;
    this.roomId = roomId;
    this.humanAccount = humanAccount;
    this.humanSocketId = humanSocketId;
  }

  get human(): string {
    return this.humanAccount;
  }

  setHumanSocket(socketId: string): void {
    this.humanSocketId = socketId;
    this.sendPrivateTo(socketId);
  }

  start(): Promise<void> {
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    try {
      await this.waitForRoom();
      await ensureSessionFunded(this.humanAccount);
      for (const agent of agents) {
        await ensureAgentFunded(agent);
      }

      for (const agent of agents) {
        this.beforeBalances.set(agent.id, await balanceYocto(agent.accountId));
      }

      await this.joinAgents();
      await this.waitForPlayers();
      await this.startOnChain();

      this.sendPrivateTo(this.humanSocketId);
      this.timer = setInterval(() => {
        void this.tick();
      }, 2_000);
      await this.tick();
    } catch (error) {
      console.error(`[engine] ${this.roomId} start failed`, error);
      this.done = true;
      this.io.to(this.roomId).emit("error", {
        type: "error",
        message: `Game start failed: ${String(error)}`,
      });
    }
  }

  private async waitForRoom(): Promise<ChainRoom> {
    // Loading the app and signing create_room can take a while on a busy
    // Testnet RPC; give the browser a full minute to open the room.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const room = await getRoom(this.roomId);
        if (room.host !== this.humanAccount) {
          throw new Error(`Room host is ${room.host}, expected ${this.humanAccount}`);
        }
        if (room.phase !== "lobby") {
          throw new Error(`Room is already in ${room.phase}`);
        }
        return room;
      } catch (error) {
        lastError = error;
      }
      await sleep(1_000);
    }
    throw lastError ?? new Error("Room not found");
  }

  private async joinAgents(): Promise<void> {
    await Promise.all(
      agents.map(async (agent) => {
        try {
          const tx = await joinViaWallet(agent, this.roomId);
          this.log(`${agent.name} staked 0.1 NEAR and joined`, tx.hash);
        } catch (error) {
          this.log(`${agent.name} join failed: ${String(error)}`);
          console.error(`[engine] ${this.roomId} ${agent.id} join failed`, error);
        }
      }),
    );
  }

  private async waitForPlayers(): Promise<ChainRoom> {
    for (let attempt = 0; attempt < 60; attempt++) {
      const room = await getRoom(this.roomId);
      if (room.players.length >= config.players) return room;
      if (attempt === 30) {
        // Retry any seat that did not land.
        for (const agent of agents) {
          if (!room.players.some((player) => player.account === agent.accountId)) {
            try {
              await joinViaWallet(agent, this.roomId);
            } catch (error) {
              this.log(`${agent.name} retry failed: ${String(error)}`);
            }
          }
        }
      }
      await sleep(500);
    }
    throw new Error("Agents did not fill the room");
  }

  private assignRoles(room: ChainRoom): void {
    this.pair = pickWordPair();
    const impostorIndex = randomInt(room.players.length);
    const agentByAccount = new Map(agents.map((agent) => [agent.accountId, agent]));

    this.seats = room.players.map((player, index) => {
      const role: Role = index === impostorIndex ? "impostor" : "crew";
      const agent = agentByAccount.get(player.account);
      const salt = randomUUID();
      this.roles.set(player.account, role);
      this.roleSalts.set(player.account, salt);
      return {
        account: player.account,
        name: agent?.name ?? HUMAN_NAME,
        isAgent: Boolean(agent),
        agentId: agent?.id,
        role,
        word: role === "impostor" ? this.pair!.impostor : this.pair!.crew,
        salt,
        alive: player.alive,
      };
    });
  }

  private async startOnChain(): Promise<void> {
    const room = await getRoom(this.roomId);
    console.log(
      `[engine] ${this.roomId} start_game: phase=${room.phase} players=${room.players.length}/${room.max_players}`,
    );
    if (!this.pair) this.assignRoles(room);
    const commitments: [string, string][] = this.seats.map((seat) => [
      seat.account,
      commitment(seat.role, seat.salt),
    ]);
    const tx = await startGame(
      this.roomId,
      commitments,
      agents.map((agent) => agent.accountId),
    );
    this.log(`Game master started the game; ${this.roles.size} role commitments locked`, tx.hash);
  }

  private async tick(): Promise<void> {
    if (this.busy || this.done) return;
    this.busy = true;
    try {
      const room = await withTimeout(getRoom(this.roomId), 10_000);
      if (room.phase !== this.lastLoggedPhase) {
        this.lastLoggedPhase = room.phase;
        console.log(`[engine] ${this.roomId} phase=${room.phase} round=${room.round}`);
      }
      this.syncAlive(room);
      await this.refreshRound(room.round);
      // Publish the phase before running agent transactions: one slow RPC must
      // not keep the human from seeing (and acting in) the new phase.
      await this.emitState(room);
      await this.step(room);
      await this.emitState(room);
    } catch (error) {
      console.error(`[engine] ${this.roomId} tick error`, error);
      this.log(`Tick error: ${String(error)}`);
    } finally {
      this.busy = false;
    }
  }

  private syncAlive(room: ChainRoom): void {
    for (const seat of this.seats) {
      const player = room.players.find((item) => item.account === seat.account);
      if (player) seat.alive = player.alive;
    }
  }

  private async step(room: ChainRoom): Promise<void> {
    switch (room.phase) {
      case "lobby":
        return;
      case "describing":
        await this.stepDescribing(room);
        return;
      case "votecommit":
        await this.stepVoteCommit(room);
        return;
      case "votereveal":
        await this.stepVoteReveal(room);
        return;
      case "rolereveal":
        await this.stepRoleReveal(room);
        return;
      case "finished":
        await this.stepFinished(room);
        return;
      case "settled":
        if (!this.result) await this.finalizeResult(room);
        this.stop();
        return;
      case "refunded":
        this.log("Game was refunded.");
        this.stop();
        return;
    }
  }

  private roundState(round: number): RoundState {
    let state = this.rounds.get(round);
    if (!state) {
      state = {
        decisions: new Map(),
      commitTargets: new Map(),
        salts: new Map(),
        submitted: new Set(),
        committed: new Set(),
        revealed: new Set(),
        roleAdvanced: false,
        settled: false,
      };
      this.rounds.set(round, state);
    }
    return state;
  }

  private aliveAgents(): Seat[] {
    return this.seats.filter((seat) => seat.alive && seat.isAgent);
  }

  private async ensureDecisions(round: number): Promise<void> {
    const state = this.roundState(round);
    const missing = this.aliveAgents().filter((seat) => !state.decisions.has(seat.agentId!));
    if (missing.length === 0) return;

    const history = this.historyBefore(round);
    const alive: SeatInfo[] = this.seats
      .filter((seat) => seat.alive)
      .map((seat) => ({
        account: seat.account,
        name: seat.name,
        isAgent: seat.isAgent,
        agentId: seat.agentId,
        role: seat.role,
      }));
    const allSeats: SeatInfo[] = this.seats.map((seat) => ({
      account: seat.account,
      name: seat.name,
      isAgent: seat.isAgent,
      agentId: seat.agentId,
      role: seat.role,
    }));

    const decisions = await Promise.all(
      missing.map(async (seat) => {
        const agent = agentConfig(seat.agentId!);
        const decision = await decideTurn({
          agent,
          role: seat.role,
          word: seat.word,
          round,
          history,
          alive,
          allSeats,
        });
        return { seat, decision };
      }),
    );

    for (const { seat, decision } of decisions) {
      const validTarget =
        this.seats.some(
          (item) =>
            item.alive &&
            item.account === decision.target &&
            item.account !== seat.account,
        ) || false;
      if (!validTarget) {
        const fallback = this.seats.find(
          (item) => item.alive && item.account !== seat.account,
        );
        decision.target = fallback?.account ?? decision.target;
      }
      state.decisions.set(seat.agentId!, decision);
      this.thoughts.push({
        round,
        agentId: seat.agentId!,
        persona: seat.name,
        text: decision.reasoning,
        suspect: decision.target,
        source: decision.source,
      });
      this.log(
        `${seat.name} is thinking${decision.source === "scripted" ? " (scripted)" : ""}…`,
      );
    }
  }

  private async stepDescribing(room: ChainRoom): Promise<void> {
    const state = this.roundState(room.round);
    await this.ensureDecisions(room.round);
    await this.refreshRound(room.round);

    for (const seat of this.aliveAgents()) {
      if (state.submitted.has(seat.agentId!)) continue;
      if (this.roundCache.get(room.round)?.descriptions.has(seat.account)) {
        state.submitted.add(seat.agentId!);
        continue;
      }
      const decision = state.decisions.get(seat.agentId!);
      if (!decision) continue;
      state.submitted.add(seat.agentId!);
      try {
        const tx = await submitDescription(seat.agentId!, this.roomId, decision.description);
        this.log(`${seat.name}: "${decision.description}"`, tx.hash);
      } catch (error) {
        const message = String(error);
        if (message.includes("Description already submitted")) {
          this.log(`${seat.name} description was already on chain`);
        } else {
          state.submitted.delete(seat.agentId!);
          this.log(`${seat.name} description failed: ${message}`);
        }
      }
    }

    await this.maybeForceAdvance(room);
  }

  private async stepVoteCommit(room: ChainRoom): Promise<void> {
    const state = this.roundState(room.round);
    await this.ensureDecisions(room.round);

    for (const seat of this.aliveAgents()) {
      if (state.committed.has(seat.agentId!)) continue;
      const decision = state.decisions.get(seat.agentId!);
      if (!decision) continue;
      // Keep the target and salt stable across retries: a transaction that we
      // timed out on may still have landed, and the reveal must match it.
      let target = state.commitTargets.get(seat.agentId!) ?? decision.target;
      if (
        target === seat.account ||
        !this.seats.some((item) => item.alive && item.account === target)
      ) {
        target =
          this.seats.find((item) => item.alive && item.account !== seat.account)
            ?.account ?? target;
      }
      const salt = state.salts.get(seat.agentId!) ?? randomUUID();
      state.commitTargets.set(seat.agentId!, target);
      state.salts.set(seat.agentId!, salt);
      state.committed.add(seat.agentId!);
      try {
        const hash = commitment(target, salt);
        const tx = await commitVote(seat.agentId!, this.roomId, hash);
        this.log(`${seat.name} committed a vote`, tx.hash);
      } catch (error) {
        const message = String(error);
        if (message.includes("Vote already committed")) {
          this.log(`${seat.name} vote was already committed on chain`);
        } else {
          state.committed.delete(seat.agentId!);
          this.log(`${seat.name} vote commit failed: ${message}`);
        }
      }
    }

    await this.maybeForceAdvance(room);
  }

  private async stepVoteReveal(room: ChainRoom): Promise<void> {
    const state = this.roundState(room.round);
    await this.refreshRound(room.round);

    for (const seat of this.aliveAgents()) {
      if (state.revealed.has(seat.agentId!)) continue;
      if (this.roundCache.get(room.round)?.votes.has(seat.account)) {
        state.revealed.add(seat.agentId!);
        continue;
      }
      const target = state.commitTargets.get(seat.agentId!);
      const salt = state.salts.get(seat.agentId!);
      if (!target || !salt) continue;
      state.revealed.add(seat.agentId!);
      try {
        const tx = await revealVote(seat.agentId!, this.roomId, target, salt);
        this.log(`${seat.name} revealed a vote`, tx.hash);
      } catch (error) {
        const message = String(error);
        if (message.includes("Vote already revealed")) {
          this.log(`${seat.name} vote was already revealed on chain`);
        } else {
          state.revealed.delete(seat.agentId!);
          this.log(`${seat.name} vote reveal failed: ${message}`);
        }
      }
    }

    await this.maybeForceAdvance(room);
  }

  private async stepRoleReveal(room: ChainRoom): Promise<void> {
    const state = this.roundState(room.round);
    if (state.roleAdvanced) return;

    if (room.pending_exile) {
      const seat = this.seats.find((item) => item.account === room.pending_exile);
      if (seat) {
        try {
          const tx = await revealRole(
            this.roomId,
            seat.account,
            seat.role,
            seat.salt,
          );
          this.log(
            `${seat.name} was exiled and revealed as ${seat.role.toUpperCase()}`,
            tx.hash,
          );
        } catch (error) {
          this.log(`Role reveal failed: ${String(error)}`);
          await this.maybeForceAdvance(room);
          return;
        }
      }
    }

    state.roleAdvanced = true;
    try {
      const tx = await advance(this.roomId);
      this.log("Round resolved", tx.hash);
    } catch (error) {
      state.roleAdvanced = false;
      this.log(`Advance failed: ${String(error)}`);
    }
  }

  private async stepFinished(room: ChainRoom): Promise<void> {
    const state = this.roundState(room.round);
    if (state.settled) return;
    state.settled = true;
    this.potBeforeSettle = room.pot;
    try {
      const tx = await settle(
        this.roomId,
        this.seats.map((seat) => ({
          player: seat.account,
          role: seat.role,
          salt: seat.salt,
        })),
      );
      this.log(`Settlement paid the winners`, tx.hash);
    } catch (error) {
      state.settled = false;
      this.log(`Settlement failed: ${String(error)}`);
    }
  }

  private async maybeForceAdvance(room: ChainRoom): Promise<void> {
    if (!ACTIVE_PHASES.has(room.phase)) return;
    const now = Math.floor(Date.now() / 1000);
    if (now <= room.phase_deadline + FORCE_GRACE_SECONDS) return;
    const key = `${room.phase}:${room.round}:${room.phase_deadline}`;
    if (this.lastForceKey === key) return;
    this.lastForceKey = key;
    try {
      const tx = await forceAdvance(this.roomId);
      this.log(`Phase ${room.phase} timed out; game master forced it forward`, tx.hash);
    } catch (error) {
      this.log(`Force advance failed: ${String(error)}`);
    }
  }

  private historyBefore(round: number): HistoryLine[] {
    const lines: HistoryLine[] = [];
    for (let current = 1; current < round; current++) {
      const cached = this.roundCache.get(current);
      if (!cached) continue;
      for (const [account, text] of cached.descriptions) {
        lines.push({ round: current, name: this.nameOf(account), text });
      }
    }
    return lines;
  }

  private nameOf(account: string): string {
    const seat = this.seats.find((item) => item.account === account);
    if (seat) return seat.name;
    if (account === this.humanAccount) return HUMAN_NAME;
    const agent = agents.find((item) => item.accountId === account);
    return agent?.name ?? account;
  }

  private async refreshRound(round: number): Promise<void> {
    if (round <= 0) return;
    try {
      const view = await withTimeout(getRound(this.roomId, round), 8_000);
      const cached = this.roundCache.get(round) ?? {
        descriptions: new Map<string, string>(),
        votes: new Map<string, string>(),
      };
      for (const [account, text] of view.descriptions) {
        cached.descriptions.set(account, text);
      }
      for (const [voter, target] of view.votes) {
        cached.votes.set(voter, target);
      }
      this.roundCache.set(round, cached);
    } catch {
      // Round may not exist yet.
    }
  }

  private async emitState(room: ChainRoom): Promise<void> {
    const snapshot = await this.buildSnapshot(room);
    const json = JSON.stringify(snapshot);
    if (json === this.lastStateJson) return;
    this.lastStateJson = json;
    this.io.to(this.roomId).emit("state", { type: "state", snapshot });
  }

  private async buildSnapshot(room: ChainRoom): Promise<GameSnapshot> {
    const descriptions: DescriptionView[] = [];
    const votes: VoteView[] = [];
    for (let round = 1; round <= room.round; round++) {
      const cached = this.roundCache.get(round);
      if (!cached) continue;
      for (const [account, text] of cached.descriptions) {
        descriptions.push({
          round,
          account,
          name: this.nameOf(account),
          text,
        });
      }
      for (const [voter, target] of cached.votes) {
        votes.push({ round, voter, target });
      }
    }

    const players: PlayerView[] = room.players.map((player) => {
      const agent = agents.find((item) => item.accountId === player.account);
      return {
        account: player.account,
        name: this.nameOf(player.account),
        isAgent: Boolean(agent) || player.is_agent,
        agentId: agent?.id,
        alive: player.alive,
      };
    });

    return {
      roomId: room.id,
      phase: room.phase,
      round: room.round,
      maxRounds: room.max_rounds,
      stake: room.stake,
      pot: room.pot,
      players,
      descriptions,
      votes,
      exiles: room.exiles,
      pendingExile: room.pending_exile,
      winningSide: room.winning_side as Side | null,
      winners: room.winners,
      phaseDeadline: room.phase_deadline,
      result: this.result ?? undefined,
    };
  }

  private async finalizeResult(room: ChainRoom): Promise<void> {
    const agentBalances: AgentBalanceView[] = await Promise.all(
      agents.map(async (agent) => {
        const before = this.beforeBalances.get(agent.id) ?? 0n;
        let stats = DEFAULT_STATS;
        let after = before;
        try {
          stats =
            (await withTimeout(getAgentStats(agent.accountId), 8_000)) ??
            DEFAULT_STATS;
        } catch (error) {
          console.error(`[engine] stats failed for ${agent.id}`, error);
        }
        try {
          after = await withTimeout(balanceYocto(agent.accountId), 8_000);
        } catch (error) {
          console.error(`[engine] balance failed for ${agent.id}`, error);
        }
        return {
          agentId: agent.id,
          accountId: agent.accountId,
          name: agent.name,
          before: before.toString(),
          after: after.toString(),
          stats,
        };
      }),
    );

    this.result = {
      winningSide: room.winning_side as Side | null,
      winners: room.winners,
      pot:
        this.potBeforeSettle ??
        (BigInt(room.stake) * BigInt(room.players.length)).toString(),
      stake: room.stake,
      exiles: room.exiles,
      roles: Object.fromEntries(this.roles) as Record<string, Role>,
      agentBalances,
      thoughts: this.thoughts,
      settledAt: Math.floor(Date.now() / 1000),
    };
    console.log(`[engine] ${this.roomId} finalized: ${room.winning_side} winners=${room.winners.length}`);
    this.io.to(this.roomId).emit("result", { type: "result", result: this.result });
    this.lastStateJson = "";
  }

  private privateView(): PrivatePlayerView | null {
    const seat = this.seats.find((item) => item.account === this.humanAccount);
    if (!seat) return null;
    return {
      account: seat.account,
      role: seat.role,
      word: seat.word,
    };
  }

  sendPrivateTo(socketId: string): void {
    const view = this.privateView();
    if (view) this.io.to(socketId).emit("private", { type: "private", view });
  }

  sendStateTo(socketId: string): void {
    void this.buildSnapshotForSocket(socketId);
  }

  private async buildSnapshotForSocket(socketId: string): Promise<void> {
    try {
      const room = await withTimeout(getRoom(this.roomId), 10_000);
      const snapshot = await this.buildSnapshot(room);
      this.io.to(socketId).emit("state", { type: "state", snapshot });
      if (this.result) {
        this.io.to(socketId).emit("result", { type: "result", result: this.result });
      }
    } catch {
      // Socket may be gone.
    }
  }

  private log(message: string, txHash?: string): void {
    this.io.to(this.roomId).emit("log", {
      type: "log",
      message,
      txHash,
    });
  }

  private stop(): void {
    if (this.done) return;
    this.done = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`RPC timed out after ${ms}ms`)), ms);
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
