import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AgentStats,
  GameResultView,
  GameSnapshot,
  Phase,
  PrivatePlayerView,
  Role,
  SessionInfo,
  SessionResponse,
  VoteView,
} from "@agent-undercover/shared";
import { PHASE_LABEL } from "@agent-undercover/shared";
import {
  call,
  createKeyPair,
  makeAccount,
  pollFor,
  randomSalt,
  sha256Hex,
  viewRoom,
  viewRound,
} from "./near";

interface SavedSession {
  session: SessionInfo;
  secretKey: string;
  roomCreated: boolean;
}

interface PendingVote {
  round: number;
  target: string;
  salt: string;
  committed: boolean;
  revealed: boolean;
}

interface LogEntry {
  id: string;
  message: string;
  txHash?: string;
}

interface RoundVerdict {
  round: number;
  exiled: string | null;
  role?: Role;
  votes: VoteView[];
}

interface AgentApi {
  id: string;
  name: string;
  persona: string;
  accountId: string;
  balance?: string;
  stats?: AgentStats | null;
}

interface ApiConfig {
  contractId: string;
  stake: string;
  demoMode: "live" | "scripted";
  agents: { id: string; name: string; persona: string; accountId: string }[];
}

const STORAGE_KEY = "agent-undercover:session";
const PENDING_KEY = "agent-undercover:pending-vote";
const FALLBACK_CONTRACT = "game.agent-undercover.testnet";

const FALLBACK_AGENTS: AgentApi[] = [
  {
    id: "alpha",
    name: "Alpha",
    persona: "The analyst. Cites other players' words, builds logical cases, likes lists.",
    accountId: "alpha.agents.agent-undercover.testnet",
  },
  {
    id: "beta",
    name: "Beta",
    persona: "The contrarian. Questions the majority and happily derails the room.",
    accountId: "beta.agents.agent-undercover.testnet",
  },
  {
    id: "gamma",
    name: "Gamma",
    persona: "The peacemaker. Agrees first, then adds a small observation; great at blending in.",
    accountId: "gamma.agents.agent-undercover.testnet",
  },
  {
    id: "delta",
    name: "Delta",
    persona: "The chaos agent. Uses odd metaphors and jokes; hard to pin down.",
    accountId: "delta.agents.agent-undercover.testnet",
  },
];

const PERSONA_COLORS: Record<string, string> = {
  alpha: "#b6ff3b",
  beta: "#5eead4",
  gamma: "#ffce5c",
  delta: "#ff8fab",
};

export default function App() {
  const [saved, setSaved] = useState<SavedSession | null>(loadSaved);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [privateView, setPrivateView] = useState<PrivatePlayerView | null>(null);
  const [result, setResult] = useState<GameResultView | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pendingVote, setPendingVoteState] = useState<PendingVote | null>(loadPendingVote);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingDescriptionRound, setPendingDescriptionRound] = useState<number | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [agents, setAgents] = useState<AgentApi[]>(FALLBACK_AGENTS);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);

  const savedRef = useRef(saved);
  const pendingRef = useRef(pendingVote);
  const socketRef = useRef<Socket | null>(null);
  const accountRef = useRef<ReturnType<typeof makeAccount> | null>(null);
  const revealInFlight = useRef(false);
  const describedRoundRef = useRef(0);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    pendingRef.current = pendingVote;
  }, [pendingVote]);

  const persistSaved = useCallback((next: SavedSession | null) => {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
    savedRef.current = next;
    setSaved(next);
  }, []);

  const updatePendingVote = useCallback((next: PendingVote | null) => {
    if (next) sessionStorage.setItem(PENDING_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(PENDING_KEY);
    pendingRef.current = next;
    setPendingVoteState(next);
  }, []);

  useEffect(() => {
    const initial = loadSaved();
    if (initial) accountRef.current = makeAccount(initial.session, initial.secretKey);

    fetch("/api/config")
      .then((response) => (response.ok ? response.json() : null))
      .then((value: ApiConfig | null) => value && setApiConfig(value))
      .catch(() => undefined);
    fetch("/api/agents")
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { agents?: AgentApi[] } | null) => {
        if (value?.agents?.length) setAgents(value.agents);
      })
      .catch(() => undefined);

    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const current = savedRef.current;
      if (!current?.roomCreated) return;
      socket.emit(
        "game:watch",
        { roomId: current.session.roomId },
        (watch: { ok: boolean; hasEngine?: boolean; error?: string }) => {
          if (!watch?.ok) {
            setError(watch?.error ?? "Could not restore the game on this server.");
            return;
          }
          if (!watch.hasEngine) {
            socket.emit(
              "game:start",
              { roomId: current.session.roomId },
              (started: { ok: boolean; error?: string }) => {
                if (!started?.ok) setError(started?.error ?? "Could not resume the game.");
              },
            );
          }
        },
      );
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (payload: { snapshot: GameSnapshot }) => {
      setSnapshot(payload.snapshot);
      if (payload.snapshot.result) setResult(payload.snapshot.result);
    });
    socket.on("private", (payload: { view: PrivatePlayerView }) => {
      setPrivateView(payload.view);
    });
    socket.on("log", (payload: LogEntry) => {
      setLogs((current) =>
        [
          ...current,
          { ...payload, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ].slice(-60),
      );
    });
    socket.on("result", (payload: { result: GameResultView }) => setResult(payload.result));
    socket.on("error", (payload: { message: string }) => setError(payload.message));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.phase === "describing" && pendingDescriptionRound !== null && pendingDescriptionRound < snapshot.round) {
      setPendingDescriptionRound(null);
    }
    if (pendingVote && snapshot.round > pendingVote.round) updatePendingVote(null);
  }, [snapshot?.phase, snapshot?.round]);

  useEffect(() => {
    if (!snapshot || !saved) return;
    const mine = snapshot.votes.some(
      (vote) => vote.round === snapshot.round && vote.voter === saved.session.accountId,
    );
    if (mine && pendingVote && !pendingVote.revealed) {
      updatePendingVote({ ...pendingVote, revealed: true });
    }
  }, [snapshot, pendingVote, saved, updatePendingVote]);

  // Reveal the pending vote with the salt this browser kept. Safe to call more
  // than once: the chain rejects a second reveal, which we treat as success.
  const revealPendingVote = useCallback(async () => {
    const vote = pendingRef.current;
    const current = savedRef.current;
    const account = accountRef.current;
    if (!vote || !current || !account || !vote.committed || vote.revealed) return;
    if (revealInFlight.current) return;
    revealInFlight.current = true;
    try {
      console.log("[vote] reveal start", vote.round, vote.target);
      await call(account, {
        contractId: current.session.contractId,
        methodName: "reveal_vote",
        args: {
          room_id: current.session.roomId,
          target: vote.target,
          salt: vote.salt,
        },
      });
      console.log("[vote] reveal ok");
      updatePendingVote({ ...vote, revealed: true });
      setToast("Vote revealed. The room can now tally.");
    } catch (caught) {
      const message = String(caught);
      console.log("[vote] reveal failed", message);
      if (message.includes("already revealed")) {
        updatePendingVote({ ...vote, revealed: true });
      } else {
        const round = vote.round;
        const found = await pollFor(async () => {
          const view = await viewRound(
            account,
            current.session.contractId,
            current.session.roomId,
            round,
          );
          return view?.votes.some(([voter]) => voter === current.session.accountId)
            ? view
            : null;
        }, 25_000);
        if (found) {
          updatePendingVote({ ...vote, revealed: true });
          setToast("Vote revealed. The room can now tally.");
        } else {
          setError(`Reveal failed: ${friendlyError(caught)}`);
        }
      }
    } finally {
      revealInFlight.current = false;
    }
  }, [updatePendingVote]);

  // Auto-reveal once the commit phase closes. The salt never leaves this browser.
  useEffect(() => {
    if (!snapshot || snapshot.phase !== "votereveal") return;
    const vote = pendingRef.current;
    if (!vote || vote.round !== snapshot.round) return;
    if (!vote.committed || vote.revealed) return;
    void revealPendingVote();
  }, [snapshot?.phase, snapshot?.round, pendingVote, revealPendingVote]);

  // Do not depend on a server snapshot arriving: the engine may still be
  // finalizing an agent's transaction. Poll the chain directly for the phase.
  useEffect(() => {
    if (!pendingVote?.committed || pendingVote.revealed) return;
    const current = savedRef.current;
    const account = accountRef.current;
    if (!current || !account) return;
    const vote = pendingVote;
    let stopped = false;

    const check = async () => {
      if (stopped || revealInFlight.current) return;
      try {
        const room = (await account.provider.callFunction({
          contractId: current.session.contractId,
          method: "get_room",
          args: { room_id: current.session.roomId },
        })) as { phase: string; round: number };
        if (!stopped && room.phase === "votereveal" && room.round === vote.round) {
          await revealPendingVote();
        }
      } catch {
        // Transient relay error; the next poll retries.
      }
    };

    const timer = setInterval(() => void check(), 5000);
    void check();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingVote?.committed, pendingVote?.revealed, pendingVote?.round, revealPendingVote]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const startGame = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) {
      setError("Still connecting to the game server. Try again in a second.");
      return;
    }
    try {
      setError(null);
      setBusy("Creating a disposable Testnet wallet in your browser…");
      const keyPair = createKeyPair();
      const created = await emitAck<SessionResponse>(socket, "session:create", {
        publicKey: keyPair.getPublicKey().toString(),
      });
      if (!created.ok) throw new Error(created.error);

      const next: SavedSession = {
        session: created.session,
        secretKey: keyPair.toString(),
        roomCreated: false,
      };
      persistSaved(next);
      updatePendingVote(null);
      const account = makeAccount(created.session, next.secretKey);
      accountRef.current = account;

      setBusy("You stake 0.1 NEAR. The escrow opens the room…");
      try {
        await call(account, {
          contractId: created.session.contractId,
          methodName: "create_room",
          args: {
            room_id: created.session.roomId,
            stake: created.session.stake,
            max_players: 5,
            impostor_count: 1,
            max_rounds: 3,
          },
          deposit: BigInt(created.session.stake),
        });
      } catch (caught) {
        // The RPC response can time out after the transaction landed. Confirm
        // on chain before treating the room as missing.
        console.warn("[room] create_room response failed; checking the chain", caught);
        const room = await pollFor(
          () => viewRoom(account, created.session.contractId, created.session.roomId),
          25_000,
        );
        if (!room || room.host !== created.session.accountId) throw caught;
        console.log("[room] create_room landed despite the error", room.phase);
      }
      persistSaved({ ...next, roomCreated: true });

      setBusy("Four agents are staking their own NEAR…");
      const started = await emitAck<{ ok: boolean; error?: string }>(socket, "game:start", {
        roomId: created.session.roomId,
      });
      if (!started.ok) throw new Error(started.error ?? "Game did not start");
      setBusy(null);
    } catch (caught) {
      setBusy(null);
      setError(friendlyError(caught));
    }
  }, [apiConfig, persistSaved, updatePendingVote]);

  const ensureAccount = useCallback(() => {
    if (accountRef.current) return accountRef.current;
    const current = savedRef.current;
    if (!current) return null;
    accountRef.current = makeAccount(current.session, current.secretKey);
    return accountRef.current;
  }, []);

  const submitDescription = useCallback(
    async (text: string) => {
      const current = savedRef.current;
      const account = ensureAccount();
      if (!current || !account || !snapshot) return;
      if (new TextEncoder().encode(text).byteLength > 280) {
        setError("Descriptions are limited to 280 bytes on-chain.");
        return;
      }
      if (describedRoundRef.current === snapshot.round) return;
      describedRoundRef.current = snapshot.round;
      try {
        setError(null);
        // Lock the composer immediately; the RPC result may arrive late.
        setPendingDescriptionRound(snapshot.round);
        await call(account, {
          contractId: current.session.contractId,
          methodName: "submit_description",
          args: { room_id: current.session.roomId, text },
        });
        setToast("Description submitted on-chain.");
      } catch (caught) {
        const message = String(caught);
        if (message.includes("Description already submitted")) {
          setPendingDescriptionRound(snapshot.round);
          setToast("Description submitted on-chain.");
        } else {
          const round = snapshot.round;
          const found = await pollFor(async () => {
            const view = await viewRound(
              account,
              current.session.contractId,
              current.session.roomId,
              round,
            );
            return view?.descriptions.some(([who]) => who === current.session.accountId)
              ? view
              : null;
          }, 25_000);
          if (found) {
            setPendingDescriptionRound(round);
            setToast("Description submitted on-chain.");
          } else {
            describedRoundRef.current = 0;
            setPendingDescriptionRound(null);
            setError(friendlyError(caught));
          }
        }
      }
    },
    [ensureAccount, snapshot],
  );

  const commitVote = useCallback(
    async (target: string) => {
      const current = savedRef.current;
      const account = ensureAccount();
      if (!current || !account || !snapshot) return;
      try {
        setSubmittingVote(true);
        setError(null);
        // Retrying a commit must reuse the original target and salt: the first
        // attempt may have landed even if its RPC response was lost.
        const prior = pendingRef.current;
        const vote =
          prior && prior.round === snapshot.round && !prior.revealed
            ? prior
            : { round: snapshot.round, target, salt: randomSalt(), committed: false, revealed: false };
        const pending: PendingVote = {
          round: vote.round,
          target: vote.target,
          salt: vote.salt,
          committed: false,
          revealed: false,
        };
        const hash = await sha256Hex(`${pending.target}:${pending.salt}`);
        updatePendingVote(pending);
        await call(account, {
          contractId: current.session.contractId,
          methodName: "commit_vote",
          args: { room_id: current.session.roomId, commitment: hash },
        });
        updatePendingVote({ ...pending, committed: true });
        setToast("Vote committed. It stays hidden until everyone commits.");
      } catch (caught) {
        const message = String(caught);
        console.log("[vote] commit failed", message);
        const prior = pendingRef.current;
        if (message.includes("Vote already committed") && prior) {
          updatePendingVote({ ...prior, committed: true });
          setToast("Vote committed. It stays hidden until everyone commits.");
        } else {
          // If the phase has moved on, the commit may still have landed; keep
          // the salt and let the reveal path try.
          const moved = await pollFor(async () => {
            const room = await viewRoom(
              account,
              current.session.contractId,
              current.session.roomId,
            );
            return room && room.phase !== "votecommit" ? room : null;
          }, 12_000);
          if (prior && moved) {
            updatePendingVote({ ...prior, committed: true });
            setError("The commit response was lost; the vote will be revealed if it landed.");
          } else {
            setError(friendlyError(caught));
          }
        }
      } finally {
        setSubmittingVote(false);
      }
    },
    [ensureAccount, snapshot, updatePendingVote],
  );

  const finalResult = result ?? snapshot?.result ?? null;
  const contractId = saved?.session.contractId ?? apiConfig?.contractId ?? FALLBACK_CONTRACT;

  return (
    <div className="app">
      <Header connected={connected} contractId={contractId} />
      {error && (
        <div className="banner error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {finalResult && snapshot ? (
        <ResultScreen
          result={finalResult}
          snapshot={snapshot}
          account={saved?.session.accountId ?? ""}
          privateView={privateView}
          onPlayAgain={() => {
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(PENDING_KEY);
            window.location.reload();
          }}
        />
      ) : snapshot && snapshot.phase !== "lobby" ? (
        <GameScreen
          snapshot={snapshot}
          account={saved?.session.accountId ?? ""}
          privateView={privateView}
          pendingVote={pendingVote}
          pendingDescriptionRound={pendingDescriptionRound}
          submittingVote={submittingVote}
          logs={logs}
          contractId={contractId}
          onDescribe={submitDescription}
          onVote={commitVote}
        />
      ) : saved?.roomCreated || snapshot?.phase === "lobby" ? (
        <LobbyScreen snapshot={snapshot} busy={busy} logs={logs} />
      ) : (
        <Landing
          agents={agents}
          config={apiConfig}
          busy={busy}
          connected={connected}
          contractId={contractId}
          onStart={startGame}
        />
      )}

      {busy && (
        <div className="busy-overlay">
          <div className="busy-card">
            <div className="spinner" />
            <strong>Setting the table</strong>
            <p>{busy}</p>
            <span className="muted">Testnet transactions finalize in a few seconds.</span>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Header({ connected, contractId }: { connected: boolean; contractId: string }) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">AU</div>
        <div>
          <div className="brand-name">Agent Undercover</div>
          <div className="brand-sub">social deduction, settled on-chain</div>
        </div>
      </div>
      <div className="header-right">
        <span className="chip chip-testnet">NEAR Testnet</span>
        <span className={`connection ${connected ? "online" : ""}`}>
          <i />
          {connected ? "live" : "connecting"}
        </span>
        <a className="chip chip-link" href={explorerAccount(contractId)} target="_blank" rel="noreferrer">
          contract ↗
        </a>
      </div>
    </header>
  );
}

function Landing({
  agents,
  config,
  busy,
  connected,
  contractId,
  onStart,
}: {
  agents: AgentApi[];
  config: ApiConfig | null;
  busy: string | null;
  connected: boolean;
  contractId: string;
  onStart: () => void;
}) {
  return (
    <main className="landing">
      <section className="hero">
        <div className="eyebrow">
          <span className="pulse-dot" /> 5 players · 1 impostor · 0.5 NEAR pot
        </div>
        <h1>
          Five players.
          <br />
          <span className="accent">One is lying.</span>
        </h1>
        <p className="lede">
          You and four AI agents put real Testnet NEAR into escrow. Everyone gets a secret
          word — except the impostor, who gets a similar one and has to blend in. Describe,
          suspect, vote. The winning side takes the pot.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={onStart} disabled={Boolean(busy) || !connected}>
            Stake 0.1 NEAR · Play now
            <span>→</span>
          </button>
          <div className="hero-note">
            <strong>No wallet install.</strong> A disposable session account is created in
            your browser. Testnet only.
          </div>
        </div>
        <div className="trust-strip">
          <span>Escrow: <b>{short(contractId)}</b></span>
          <span>Commit-reveal votes</span>
          <span>Agents hold scoped keys only</span>
        </div>
      </section>

      <section className="agents-section">
        <div className="section-head">
          <h2>Meet the table</h2>
          <span className={`chip ${config?.demoMode === "live" ? "chip-live" : "chip-muted"}`}>
            {config?.demoMode === "live" ? "NEAR AI Cloud · live" : "scripted fallback · no API key"}
          </span>
        </div>
        <div className="agent-grid">
          {agents.map((agent) => (
            <article className="agent-card" key={agent.id}>
              <div className="agent-top">
                <div
                  className="agent-avatar"
                  style={{ background: PERSONA_COLORS[agent.id] ?? "#b6ff3b" }}
                >
                  {agent.name.slice(0, 1)}
                </div>
                <div>
                  <h3>{agent.name}</h3>
                  <a
                    className="mono tiny muted"
                    href={explorerAccount(agent.accountId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(agent.accountId)}
                  </a>
                </div>
                <span className="agent-balance">
                  {agent.balance ? `${formatNear(agent.balance, 3)} N` : "—"}
                </span>
              </div>
              <p>{agent.persona}</p>
              <div className="agent-stats">
                <span>{agent.stats ? `${agent.stats.games} games` : "on-chain wallet"}</span>
                <span>{agent.stats ? `${agent.stats.wins} wins` : "scoped key only"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="how">
        <div className="step">
          <span className="step-num">01</span>
          <h3>Stake</h3>
          <p>Your 0.1 NEAR and every agent's stake are locked by the same escrow contract.</p>
        </div>
        <div className="step">
          <span className="step-num">02</span>
          <h3>Describe</h3>
          <p>One sentence each. Say too much and the impostor learns your word; say too little and you look guilty.</p>
        </div>
        <div className="step">
          <span className="step-num">03</span>
          <h3>Commit, reveal, settle</h3>
          <p>Votes are hashed first, revealed together, and the contract pays the winners — agents included.</p>
        </div>
      </section>

      <footer className="landing-footer">
        Built at NEAR HACKATHON · Demo uses NEAR Testnet only ·{" "}
        <a href={explorerAccount(contractId)} target="_blank" rel="noreferrer">
          inspect the contract ↗
        </a>
      </footer>
    </main>
  );
}

function LobbyScreen({
  snapshot,
  busy,
  logs,
}: {
  snapshot: GameSnapshot | null;
  busy: string | null;
  logs: LogEntry[];
}) {
  const players = snapshot?.players ?? [];
  const slots = Array.from({ length: 5 }, (_, index) => players[index]);
  return (
    <main className="game-shell">
      <div className="lobby">
        <div className="eyebrow">
          <span className="pulse-dot" /> Table forming
        </div>
        <h1>The agents are taking their seats.</h1>
        <p className="lede">
          {busy ?? "Each agent sends 0.1 NEAR from its own wallet into escrow."}
        </p>
        <div className="seat-row">
          {slots.map((player, index) => (
            <div className={`seat ${player ? "filled" : ""}`} key={player?.account ?? index}>
              <div className="seat-avatar">
                {player ? player.name.slice(0, 1) : index + 1}
              </div>
              <strong>{player?.name ?? "empty seat"}</strong>
              <span className="tiny muted">
                {player ? (player.isAgent ? "AI agent" : "you") : "waiting"}
              </span>
              {player && (
                <span className={`seat-status ${player.isAgent ? "agent" : "human"}`}>
                  {player.isAgent ? "staked" : "host"}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="pot-line">
          <span>Pot</span>
          <strong>{snapshot ? formatNear(snapshot.pot, 2) : "0.00"} NEAR</strong>
          <span className="muted">· 5 × 0.1 locked</span>
        </div>
        {logs.length > 0 && <Feed logs={logs} />}
      </div>
    </main>
  );
}

function GameScreen({
  snapshot,
  account,
  privateView,
  pendingVote,
  pendingDescriptionRound,
  submittingVote,
  logs,
  contractId,
  onDescribe,
  onVote,
}: {
  snapshot: GameSnapshot;
  account: string;
  privateView: PrivatePlayerView | null;
  pendingVote: PendingVote | null;
  pendingDescriptionRound: number | null;
  submittingVote: boolean;
  logs: LogEntry[];
  contractId: string;
  onDescribe: (text: string) => Promise<void>;
  onVote: (target: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdict] = useState<RoundVerdict | null>(null);
  const [roundBanner, setRoundBanner] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastVerdictRound = useRef(0);
  const announcedRound = useRef(0);
  const me = snapshot.players.find((player) => player.account === account);
  const alivePlayers = snapshot.players.filter((player) => player.alive);
  const currentDescriptions = snapshot.descriptions.filter(
    (item) => item.round === snapshot.round,
  );
  const hasDescribed =
    currentDescriptions.some((item) => item.account === account) ||
    pendingDescriptionRound === snapshot.round;
  const myPendingVote = pendingVote?.round === snapshot.round ? pendingVote : null;
  const canWrite =
    snapshot.phase === "describing" && me?.alive !== false && !hasDescribed && !submitting;
  const canVote =
    snapshot.phase === "votecommit" &&
    me?.alive !== false &&
    !myPendingVote?.committed &&
    !submittingVote;
  const remaining = Math.max(0, snapshot.phaseDeadline - Math.floor(now / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelected(null);
  }, [snapshot.phase, snapshot.round]);

  // The chain resolves a round inside a couple of ticks, so the role reveal can
  // be gone before anyone reads it. Hold a local verdict card with the round's
  // final tally, then let the table continue underneath.
  useEffect(() => {
    if (snapshot.phase !== "rolereveal") return;
    if (lastVerdictRound.current === snapshot.round) return;
    lastVerdictRound.current = snapshot.round;
    setVerdict({
      round: snapshot.round,
      exiled: snapshot.pendingExile,
      role: snapshot.pendingExile
        ? snapshot.revealedRoles?.[snapshot.pendingExile]
        : undefined,
      votes: snapshot.votes.filter((vote) => vote.round === snapshot.round),
    });
  }, [snapshot.phase, snapshot.round, snapshot.pendingExile, snapshot.revealedRoles, snapshot.votes]);

  useEffect(() => {
    if (!verdict) return;
    const timer = setTimeout(() => setVerdict(null), 5200);
    return () => clearTimeout(timer);
  }, [verdict]);

  // Announce each round once, as its description phase opens.
  useEffect(() => {
    if (snapshot.phase !== "describing") return;
    if (announcedRound.current === snapshot.round) return;
    announcedRound.current = snapshot.round;
    setRoundBanner(snapshot.round);
  }, [snapshot.phase, snapshot.round]);

  useEffect(() => {
    if (roundBanner === null) return;
    const timer = setTimeout(() => setRoundBanner(null), 2400);
    return () => clearTimeout(timer);
  }, [roundBanner]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await onDescribe(text);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  const bytes = new TextEncoder().encode(draft).byteLength;

  return (
    <main className="game-shell">
      {roundBanner !== null && (
        <div className="round-banner" key={roundBanner}>
          <span>
            ROUND {roundBanner}{" "}
            <i>/ {snapshot.maxRounds}</i>
          </span>
          <small>one sentence each · everyone is watching</small>
        </div>
      )}
      <div className={`game-top ${roundBanner !== null ? "is-overlaid" : ""}`}>
        <div className="round-block">
          <span className="muted tiny">ROUND</span>
          <strong>
            {Math.max(1, snapshot.round)} <span>/ {snapshot.maxRounds}</span>
          </strong>
        </div>
        <div className="phase-block">
          <span className="phase-chip">{PHASE_LABEL[snapshot.phase]}</span>
          <span className="tiny muted">{phaseHelp(snapshot.phase, me?.alive !== false)}</span>
        </div>
        <div className="pot-block">
          <span className="muted tiny">POT</span>
          <strong>{formatNear(snapshot.pot, 2)} NEAR</strong>
        </div>
        <div className={`timer ${remaining <= 10 ? "urgent" : ""}`}>
          <span className="tiny muted">PHASE ENDS</span>
          <strong>{formatCountdown(remaining)}</strong>
        </div>
      </div>

      <div className="game-grid">
        <div className="board">
          <section className="panel players-panel">
            <div className="panel-head">
              <h2>The table</h2>
              <span className="tiny muted">{alivePlayers.length} alive</span>
            </div>
            <div className="players-grid">
              {snapshot.players.map((player) => {
                const exiled = snapshot.exiles.includes(player.account);
                const selectedHere = selected === player.account;
                const votedByMe = snapshot.votes.some(
                  (vote) => vote.round === snapshot.round && vote.target === player.account,
                );
                const description = currentDescriptions.find(
                  (item) => item.account === player.account,
                );
                return (
                  <div className="seat-column" key={player.account}>
                    <button
                      className={`player-card ${!player.alive ? "dead" : ""} ${selectedHere ? "selected" : ""} ${player.account === account ? "you" : ""}`}
                      disabled={!canVote || !player.alive || player.account === account}
                      onClick={() => setSelected(player.account)}
                    >
                      <div className="player-top">
                        <div
                          className="player-avatar"
                          style={{
                            background: player.agentId
                              ? PERSONA_COLORS[player.agentId]
                              : "#d8e2ff",
                          }}
                        >
                          {player.name.slice(0, 1)}
                        </div>
                        <div className="player-name">
                          <strong>{player.name}</strong>
                          <span className="tiny muted">{short(player.account)}</span>
                        </div>
                        <span className={`tag ${player.isAgent ? "tag-ai" : "tag-human"}`}>
                          {player.account === account ? "YOU" : player.isAgent ? "AI" : "HUMAN"}
                        </span>
                      </div>
                      <div className="player-bottom">
                        <span className={`status ${player.alive ? "alive" : "exiled"}`}>
                          {player.alive ? "alive" : exiled ? "exiled" : "out"}
                        </span>
                        {votedByMe && <span className="tiny muted">voted</span>}
                      </div>
                      {!player.alive && <span className="player-stamp">EXILED</span>}
                    </button>
                    <SeatBubble
                      text={description?.text}
                      mine={player.account === account}
                      thinking={
                        snapshot.phase === "describing" &&
                        player.alive &&
                        player.isAgent &&
                        !description
                      }
                    />
                  </div>
                );
              })}
            </div>
            {canVote && (
              <div className="vote-bar">
                <span>
                  {selected
                    ? `Exile ${nameOf(snapshot, selected)}?`
                    : "Pick one living player to exile."}
                </span>
                <button
                  className="btn btn-danger btn-small"
                  disabled={!selected || submittingVote}
                  onClick={async () => {
                    if (!selected) return;
                    await onVote(selected);
                    setSelected(null);
                  }}
                >
                  {submittingVote ? "Committing…" : "Commit vote"}
                </button>
              </div>
            )}
            {snapshot.phase === "votecommit" && myPendingVote?.committed && (
              <div className="vote-bar done">
                <span>Your vote is committed. Waiting for the rest of the table.</span>
                <span className="mono tiny">hash hidden</span>
              </div>
            )}
            {snapshot.phase === "votereveal" && myPendingVote?.committed && (
              <div className="vote-bar done">
                <span>
                  {myPendingVote.revealed
                    ? `You revealed your vote for ${nameOf(snapshot, myPendingVote.target)}.`
                    : "Revealing your vote from the browser…"}
                </span>
              </div>
            )}
          </section>

          {snapshot.phase === "votereveal" && <TallyPanel snapshot={snapshot} />}

          <section className="panel composer-panel">
            <div className="panel-head">
              <h2>Your sentence</h2>
              <span className="tiny muted">one per round · ≤ 280 bytes</span>
            </div>
            {!me?.alive && (
              <p className="notice">
                You are out. You can still watch the agents lie to each other.
              </p>
            )}
            {snapshot.phase === "describing" && me?.alive !== false && hasDescribed && (
              <p className="notice success">
                Your description is on-chain. Waiting for the other sentences…
              </p>
            )}
            {snapshot.phase === "describing" && me?.alive !== false && !hasDescribed && (
              <div className="composer">
                <textarea
                  value={draft}
                  maxLength={280}
                  placeholder="Describe your word without saying it. Make them read into it."
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
                  }}
                  disabled={!canWrite}
                />
                <div className="composer-row">
                  <span className={`tiny ${bytes > 260 ? "warn" : "muted"}`}>{bytes} / 280 bytes</span>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => void submit()}
                    disabled={!canWrite || !draft.trim()}
                  >
                    {submitting ? "Sending…" : "Submit sentence"}
                  </button>
                </div>
              </div>
            )}
            {snapshot.phase !== "describing" && (
              <p className="notice">
                Descriptions are closed for this round. The table is voting.
              </p>
            )}

            <p className="composer-hint tiny muted">
              Sentences land on-chain and appear under each seat at the table.
            </p>
          </section>

          <section className="panel votes-panel">
            <div className="panel-head">
              <h2>Votes & history</h2>
              <span className="tiny muted">commit-reveal</span>
            </div>
            {snapshot.votes.length === 0 ? (
              <p className="muted tiny">No votes revealed yet.</p>
            ) : (
              <div className="vote-list">
                {snapshot.votes.map((vote) => (
                  <div className="vote-row" key={`${vote.round}-${vote.voter}`}>
                    <span className="tiny muted">R{vote.round}</span>
                    <span>{nameOf(snapshot, vote.voter)}</span>
                    <span className="arrow">→</span>
                    <span className="vote-target">{nameOf(snapshot, vote.target)}</span>
                  </div>
                ))}
              </div>
            )}
            {snapshot.exiles.length > 0 && (
              <div className="exile-line">
                <span className="tiny muted">EXILED</span>
                {snapshot.exiles.map((exile) => (
                  <span className="exile-chip" key={exile}>
                    {nameOf(snapshot, exile)}
                  </span>
                ))}
              </div>
            )}
            <RoundHistory snapshot={snapshot} />
          </section>
        </div>

        <aside className="side">
          <SecretCard privateView={privateView} phase={snapshot.phase} />
          <section className="panel feed-panel">
            <div className="panel-head">
              <h2>Chain feed</h2>
              <span className="tiny muted">testnet</span>
            </div>
            <Feed logs={logs} />
          </section>
          <section className="panel trust-panel">
            <h2>On-chain</h2>
            <a className="mono tiny" href={explorerAccount(contractId)} target="_blank" rel="noreferrer">
              {contractId} ↗
            </a>
            <p className="tiny muted">
              Stakes, descriptions, vote hashes and payouts all live in the escrow contract.
              The browser holds this session's only full-access key.
            </p>
          </section>
        </aside>
      </div>
      {verdict && (
        <RoundVerdictOverlay
          verdict={verdict}
          snapshot={snapshot}
          onDismiss={() => setVerdict(null)}
        />
      )}
    </main>
  );
}

function SeatBubble({
  text,
  mine,
  thinking,
}: {
  text?: string;
  mine: boolean;
  thinking: boolean;
}) {
  const typed = useTypewriter(text ?? "");
  return (
    <div className={`seat-bubble ${mine ? "mine" : ""} ${text ? "filled" : ""}`}>
      {text ? (
        <p>
          {typed}
          {typed.length < text.length && <span className="caret" />}
        </p>
      ) : mine ? (
        <span className="tiny muted">your move</span>
      ) : thinking ? (
        <span className="thinking">
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span className="tiny muted">no sentence</span>
      )}
    </div>
  );
}

function useTypewriter(text: string, speed = 16): string {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }
    // Reveal two characters per tick; a 200-character lie lands in under two
    // seconds while still reading as live typing.
    let index = 0;
    setShown("");
    const timer = setInterval(() => {
      index = Math.min(text.length, index + 2);
      setShown(text.slice(0, index));
      if (index >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return shown;
}

function voteCounts(snapshot: GameSnapshot, votes: VoteView[]): Map<string, number> {
  const counts = new Map<string, number>();
  // Count every seat, including a just-exiled one: the verdict card is rendered
  // from a snapshot that may already be a phase ahead.
  for (const player of snapshot.players) {
    counts.set(player.account, 0);
  }
  for (const vote of votes) {
    if (counts.has(vote.target)) {
      counts.set(vote.target, (counts.get(vote.target) ?? 0) + 1);
    }
  }
  return counts;
}

function TallyPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const votes = snapshot.votes.filter((vote) => vote.round === snapshot.round);
  const counts = voteCounts(snapshot, votes);
  const alive = snapshot.players.filter((player) => player.alive);
  const max = Math.max(1, ...counts.values());
  const revealed = new Set(votes.map((vote) => vote.voter)).size;
  return (
    <section className="panel tally-panel">
      <div className="panel-head">
        <h2>Live tally</h2>
        <span className="tiny muted">
          {revealed} / {alive.length} votes revealed
        </span>
      </div>
      <div className="tally-list">
        {alive.map((player) => {
          const count = counts.get(player.account) ?? 0;
          return (
            <div className={`tally-row ${count === max && count > 0 ? "leading" : ""}`} key={player.account}>
              <div className="tally-name">
                <span
                  className="tally-avatar"
                  style={{ background: player.agentId ? PERSONA_COLORS[player.agentId] : "#d8e2ff" }}
                >
                  {player.name.slice(0, 1)}
                </span>
                <span>{player.name}</span>
              </div>
              <div className="tally-bar">
                <i style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <strong className="tally-count">{count}</strong>
            </div>
          );
        })}
      </div>
      <p className="tiny muted tally-foot">
        Votes stay sealed until every player reveals. The contract tallies them in
        one transaction.
      </p>
    </section>
  );
}

function RoundVerdictOverlay({
  verdict,
  snapshot,
  onDismiss,
}: {
  verdict: RoundVerdict;
  snapshot: GameSnapshot;
  onDismiss: () => void;
}) {
  const exiledName = verdict.exiled ? nameOf(snapshot, verdict.exiled) : null;
  const counts = voteCounts(snapshot, verdict.votes);
  const alive = snapshot.players.filter((player) => player.alive || player.account === verdict.exiled);
  const max = Math.max(1, ...counts.values());
  return (
    <div className="verdict-overlay" role="status" aria-live="polite">
      <div className={`verdict-card ${verdict.exiled ? "has-exile" : "tie"}`}>
        <span className="tiny verdict-eyebrow">ROUND {verdict.round} · TABLE VERDICT</span>
        {verdict.exiled ? (
          <>
            <span className="verdict-exile">EXILED</span>
            <h2>{exiledName} is exiled.</h2>
            {verdict.role ? (
              <div className="verdict-role">
                <div className={`flip-card ${verdict.role}`}>
                  <div className="flip-face flip-back">
                    <span className="flip-mark">AU</span>
                    <span className="tiny">SEALED ROLE</span>
                  </div>
                  <div className={`flip-face flip-front ${verdict.role}`}>
                    <span className="tiny">THEIR ROLE</span>
                    <strong>{verdict.role.toUpperCase()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="verdict-stamp">EXILED</div>
            )}
            {verdict.role === "impostor" ? (
              <p className="verdict-line good">The table found the liar.</p>
            ) : (
              <p className="verdict-line bad">Wrong seat. The impostor is still in the room.</p>
            )}
          </>
        ) : (
          <>
            <h2>Split vote.</h2>
            <div className="verdict-stamp tie">NO EXILE</div>
            <p className="verdict-line">No majority. Everyone stays — and the lies continue.</p>
          </>
        )}
        <div className="verdict-tally">
          {alive.map((player) => {
            const count = counts.get(player.account) ?? 0;
            return (
              <div className="verdict-bar" key={player.account}>
                <span className="tiny">{player.name}</span>
                <div>
                  <i
                    className={player.account === verdict.exiled ? "exiled" : ""}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
                <strong className="tiny">{count}</strong>
              </div>
            );
          })}
        </div>
        <button className="btn btn-ghost btn-small verdict-dismiss" onClick={onDismiss}>
          Back to the table
        </button>
      </div>
    </div>
  );
}

function SecretCard({ privateView, phase }: { privateView: PrivatePlayerView | null; phase: Phase }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!privateView) {
      setFlipped(false);
      return;
    }
    // Let the sealed back of the card land before turning it over.
    const timer = setTimeout(() => setFlipped(true), 750);
    return () => clearTimeout(timer);
  }, [privateView?.word, privateView?.role]);

  if (!privateView) {
    return (
      <section className="panel secret-card">
        <div className="panel-head">
          <h2>Your secret</h2>
        </div>
        <p className="muted tiny">Dealing roles…</p>
      </section>
    );
  }
  const impostor = privateView.role === "impostor";
  return (
    <div className="secret-card-shell">
      <div className={`secret-card-inner ${flipped ? "flipped" : ""}`}>
        <div className="secret-face secret-back">
          <span className="card-back-mark">AU</span>
          <span className="tiny muted">DEALING YOUR ROLE</span>
        </div>
        <section className={`secret-face secret-front secret-card ${impostor ? "impostor" : "crew"}`}>
          <div className="secret-head">
            <span className="tiny">YOUR ROLE</span>
            <span className={`role-pill ${impostor ? "impostor" : "crew"}`}>
              {impostor ? "IMPOSTOR" : "CREW"}
            </span>
          </div>
          <div className="word">{privateView.word}</div>
          <p className="secret-note">
            {impostor
              ? "The crew has a similar word. Blend in, mirror their confidence, never say your own word."
              : "Find the seat whose sentence bends away from this word. Do not say the word itself."}
          </p>
          <div className="secret-foot tiny muted">{PHASE_LABEL[phase]} · keep this card to yourself</div>
        </section>
      </div>
    </div>
  );
}

function RoundHistory({ snapshot }: { snapshot: GameSnapshot }) {
  const rounds = Array.from(
    new Set(snapshot.descriptions.map((description) => description.round)),
  )
    .filter((round) => round !== snapshot.round)
    .sort((a, b) => b - a);
  if (rounds.length === 0) return null;
  return (
    <div className="history">
      {rounds.map((round) => (
        <details key={round} open={round === snapshot.round - 1}>
          <summary>Round {round}</summary>
          {snapshot.descriptions
            .filter((description) => description.round === round)
            .map((description) => (
              <div className="statement compact" key={`${round}-${description.account}`}>
                <span className="statement-name">{description.name}</span>
                <p>{description.text}</p>
              </div>
            ))}
          <div className="history-votes">
            {snapshot.votes
              .filter((vote) => vote.round === round)
              .map((vote) => (
                <span className="tiny" key={`${round}-${vote.voter}`}>
                  {nameOf(snapshot, vote.voter)} → {nameOf(snapshot, vote.target)}
                </span>
              ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function ResultScreen({
  result,
  snapshot,
  account,
  privateView,
  onPlayAgain,
}: {
  result: GameResultView;
  snapshot: GameSnapshot;
  account: string;
  privateView: PrivatePlayerView | null;
  onPlayAgain: () => void;
}) {
  const myRole = privateView?.role ?? result.roles[account] ?? null;
  const iWon = result.winners.includes(account);
  const crewWon = result.winningSide === "crew";
  const grouped = new Map<number, typeof result.thoughts>();
  for (const thought of result.thoughts) {
    const list = grouped.get(thought.round) ?? [];
    list.push(thought);
    grouped.set(thought.round, list);
  }
  const rounds = Array.from(grouped.keys()).sort((a, b) => a - b);

  return (
    <main className="result-shell">
      <section className={`result-hero ${crewWon ? "crew" : "impostors"}`}>
        <div className="eyebrow">
          <span className="pulse-dot" /> game settled on NEAR Testnet
        </div>
        <h1>{crewWon ? "Crew wins." : "Impostors win."}</h1>
        <p className="lede">
          {iWon
            ? "You backed the winning side. The escrow paid your share."
            : "The other side read the room better. Your stake went to the winners."}
        </p>
        <div className="result-tags">
          <span className="chip">Pot {formatNear(result.pot, 2)} NEAR</span>
          <span className="chip">Stake {formatNear(result.stake, 2)} NEAR</span>
          <span className="chip">
            {result.winners.length} winner{result.winners.length === 1 ? "" : "s"}
          </span>
          {myRole && (
            <span className={`chip ${myRole === "impostor" ? "chip-danger" : "chip-live"}`}>
              you were {myRole.toUpperCase()}
            </span>
          )}
        </div>
        <div className={`case-stamp ${crewWon ? "caught" : "escaped"}`}>
          <span>{crewWon ? "IMPOSTOR CAUGHT" : "IMPOSTOR ESCAPED"}</span>
          <small>CASE CLOSED</small>
        </div>
      </section>

      <div className="result-grid">
        <section className="panel payout-panel">
          <div className="panel-head">
            <h2>Payouts</h2>
            <span className="tiny muted">net of gas · on-chain balances</span>
          </div>
          <div className="payout-table">
            <div className="payout-head tiny muted">
              <span>seat</span>
              <span>role</span>
              <span>net</span>
              <span>after</span>
            </div>
            {result.agentBalances.map((balance) => {
              const delta = BigInt(balance.after) - BigInt(balance.before);
              const won = result.winners.includes(balance.accountId);
              return (
                <div className={`payout-row ${won ? "won" : ""}`} key={balance.agentId}>
                  <div>
                    <strong>{balance.name}</strong>
                    <a
                      className="mono tiny muted"
                      href={explorerAccount(balance.accountId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(balance.accountId)} ↗
                    </a>
                  </div>
                  <span className={`role-mini ${result.roles[balance.accountId]}`}>
                    {result.roles[balance.accountId] ?? "?"}
                  </span>
                  <span className={delta >= 0n ? "positive" : "negative"}>
                    {signedNear(delta)} N
                  </span>
                  <span className="mono tiny">{formatNear(balance.after, 3)} N</span>
                </div>
              );
            })}
            <div className="payout-row human-row">
              <div>
                <strong>You</strong>
                <span className="mono tiny muted">{short(account)}</span>
              </div>
              <span className={`role-mini ${myRole ?? ""}`}>{myRole ?? "?"}</span>
              <span className={iWon ? "positive" : "negative"}>
                {iWon ? "winner" : "lost stake"}
              </span>
              <span className="mono tiny">browser session</span>
            </div>
          </div>
          <div className="exile-summary">
            <span className="tiny muted">EXILES</span>
            {snapshot.exiles.length === 0 && <span className="tiny">none — round limit</span>}
            {snapshot.exiles.map((exile) => (
              <span className="exile-chip" key={exile}>
                {nameOf(snapshot, exile)} · {result.roles[exile] ?? "?"}
              </span>
            ))}
          </div>
        </section>

        <section className="panel stats-panel">
          <div className="panel-head">
            <h2>Agent records</h2>
            <span className="tiny muted">persistent across games</span>
          </div>
          <div className="stat-rows">
            {result.agentBalances.map((balance) => (
              <div className="stat-row" key={balance.agentId}>
                <strong>{balance.name}</strong>
                <span className="tiny">
                  {balance.stats.games} games · {balance.stats.wins}W-{balance.stats.losses}L
                </span>
                <span className="tiny positive">
                  +{formatNear(balance.stats.earnings_yocto, 4)} N earned
                </span>
              </div>
            ))}
          </div>
          <div className="settle-tx">
            <span className="tiny muted">SETTLED</span>
            <span className="tiny">{formatTime(result.settledAt)} UTC</span>
          </div>
        </section>
      </div>

      <section className="panel reasoning-panel">
        <div className="panel-head">
          <h2>Private reasoning replay</h2>
          <span className="tiny muted">exactly what each agent was thinking</span>
        </div>
        <p className="reasoning-intro">
          Every agent logged a private read before speaking. This is the part you never saw
          during the game — including the impostor's cover story.
        </p>
        <div className="reasoning-grid">
          {rounds.map((round) => (
            <div className="reasoning-round" key={round}>
              <h3>Round {round}</h3>
              {(grouped.get(round) ?? []).map((thought) => (
                <div className="thought" key={`${round}-${thought.agentId}`}>
                  <div className="thought-head">
                    <span
                      className="thought-avatar"
                      style={{ background: PERSONA_COLORS[thought.agentId] ?? "#b6ff3b" }}
                    >
                      {thought.persona.slice(0, 1)}
                    </span>
                    <strong>{thought.persona}</strong>
                    <span className="tiny muted">suspects {nameOf(snapshot, thought.suspect)}</span>
                    <span className={`source-badge ${thought.source}`}>{thought.source}</span>
                  </div>
                  <p>{thought.text}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="result-actions">
        <button className="btn btn-primary" onClick={onPlayAgain}>
          Play another round <span>↻</span>
        </button>
        <a className="btn btn-ghost" href={explorerAccount(account)} target="_blank" rel="noreferrer">
          Your session account ↗
        </a>
      </div>
    </main>
  );
}

function Feed({ logs }: { logs: LogEntry[] }) {
  const reversed = [...logs].reverse();
  return (
    <div className="feed">
      {reversed.length === 0 && <p className="muted tiny">Waiting for the first transaction…</p>}
      {reversed.map((entry) => (
        <div className="feed-row" key={entry.id}>
          <span className="feed-dot" />
          <span>{entry.message}</span>
          {entry.txHash && (
            <a
              className="mono tiny"
              href={explorerTx(entry.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              tx ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function phaseHelp(phase: Phase, alive: boolean): string {
  switch (phase) {
    case "describing":
      return alive ? "everyone writes one public sentence" : "you are spectating";
    case "votecommit":
      return "votes are hashed before anyone sees them";
    case "votereveal":
      return "hashes open; the tally runs when all reveal";
    case "rolereveal":
      return "the exiled seat flips";
    case "finished":
      return "paying the winners";
    default:
      return "";
  }
}

function nameOf(snapshot: GameSnapshot, account?: string | null): string {
  if (!account) return "no one";
  return snapshot.players.find((player) => player.account === account)?.name ?? short(account);
}

function loadSaved(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (!parsed?.session?.accountId || !parsed.session.roomId || !parsed.secretKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadPendingVote(): PendingVote | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingVote) : null;
  } catch {
    return null;
  }
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 90_000);
    (socket as unknown as {
      emit: (name: string, data: unknown, callback: (result: T) => void) => void;
    }).emit(event, payload, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/deposit/i.test(message)) return `Transaction rejected: ${message}`;
  if (/timed out|timeout/i.test(message)) {
    return "The Testnet RPC took too long. Try again — no stake is lost.";
  }
  return message;
}

function short(value: string): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatNear(yocto: string | bigint, digits = 4): string {
  try {
    const value = BigInt(yocto);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const base = 10n ** 24n;
    const whole = absolute / base;
    const fraction = (absolute % base).toString().padStart(24, "0").slice(0, digits);
    return `${negative ? "-" : ""}${whole}.${fraction}`;
  } catch {
    return "0.0000";
  }
}

function signedNear(yocto: bigint): string {
  const text = formatNear(yocto < 0n ? -yocto : yocto, 4);
  return `${yocto >= 0n ? "+" : "-"}${text}`;
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

function explorerAccount(account: string): string {
  return `https://testnet.nearblocks.io/address/${account}`;
}

function explorerTx(hash: string): string {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}
