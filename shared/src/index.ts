/** Types shared by the server and the browser. */

export type Phase =
  | "lobby"
  | "describing"
  | "votecommit"
  | "votereveal"
  | "rolereveal"
  | "finished"
  | "settled"
  | "refunded";

export type Role = "crew" | "impostor";
export type Side = "crew" | "impostors";

export interface ChainPlayer {
  account: string;
  is_agent: boolean;
  alive: boolean;
}

export interface ChainRoom {
  id: string;
  host: string;
  stake: string;
  max_players: number;
  impostor_count: number;
  max_rounds: number;
  players: ChainPlayer[];
  phase: Phase;
  round: number;
  pot: string;
  pending_exile: string | null;
  winning_side: Side | null;
  exiles: string[];
  winners: string[];
  created_at: number;
  phase_deadline: number;
  game_deadline: number;
}

export interface ChainRound {
  round: number;
  descriptions: [string, string][];
  votes: [string, string][];
}

export interface AgentStats {
  games: number;
  wins: number;
  losses: number;
  earnings_yocto: string;
  last_played: number;
}

export interface AgentProfile {
  id: "alpha" | "beta" | "gamma" | "delta";
  name: string;
  persona: string;
  accountId: string;
}

export interface PlayerView {
  account: string;
  name: string;
  isAgent: boolean;
  agentId?: string;
  alive: boolean;
}

export interface DescriptionView {
  round: number;
  account: string;
  name: string;
  text: string;
  txHash?: string;
}

export interface VoteView {
  round: number;
  voter: string;
  target: string;
}

export interface AgentThought {
  round: number;
  agentId: string;
  persona: string;
  text: string;
  suspect?: string;
  source: "ai" | "scripted";
}

export interface AgentBalanceView {
  agentId: string;
  accountId: string;
  name: string;
  before: string;
  after: string;
  stats: AgentStats;
}

export interface GameResultView {
  winningSide: Side | null;
  winners: string[];
  pot: string;
  stake: string;
  exiles: string[];
  roles: Record<string, Role>;
  agentBalances: AgentBalanceView[];
  thoughts: AgentThought[];
  settledAt: number;
}

export interface GameSnapshot {
  roomId: string;
  phase: Phase;
  round: number;
  maxRounds: number;
  stake: string;
  pot: string;
  players: PlayerView[];
  descriptions: DescriptionView[];
  votes: VoteView[];
  exiles: string[];
  pendingExile: string | null;
  /** Roles the table has already seen: exiled seats, plus the pending exile
      during its reveal. Never includes living players. */
  revealedRoles: Record<string, Role>;
  winningSide: Side | null;
  winners: string[];
  phaseDeadline: number;
  result?: GameResultView;
}

export interface PrivatePlayerView {
  account: string;
  role: Role;
  word: string;
  /** Only present when the human is the impostor; never sent to agents. */
  crewWordHint?: string;
}

export interface SessionInfo {
  accountId: string;
  publicKey: string;
  roomId: string;
  stake: string;
  contractId: string;
  rpcUrl: string;
}

export type ServerToClient =
  | { type: "state"; snapshot: GameSnapshot }
  | { type: "private"; view: PrivatePlayerView }
  | { type: "log"; message: string; txHash?: string }
  | { type: "result"; result: GameResultView }
  | { type: "error"; message: string };

export type ClientToServer =
  | { type: "session:create"; publicKey: string }
  | { type: "game:start"; roomId: string }
  | { type: "game:watch"; roomId: string }
  | { type: "game:ping" };

export interface SessionCreated {
  ok: true;
  session: SessionInfo;
}

export interface SessionFailed {
  ok: false;
  error: string;
}

export type SessionResponse = SessionCreated | SessionFailed;

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Lobby",
  describing: "Describing",
  votecommit: "Vote commit",
  votereveal: "Vote reveal",
  rolereveal: "Role reveal",
  finished: "Finished",
  settled: "Settled",
  refunded: "Refunded",
};
