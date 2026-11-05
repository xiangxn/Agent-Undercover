import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PublicKey } from "near-api-js";
import { Server as SocketServer } from "socket.io";
import type { SessionInfo, SessionResponse } from "@agent-undercover/shared";
import { agents, config } from "./config.js";
import {
  STAKE,
  balanceYocto,
  createSessionAccount,
  getAgentStats,
} from "./near.js";
import { GameSession } from "./game/engine.js";

interface SessionEntry {
  session: SessionInfo;
  engine: GameSession | null;
  createdAt: number;
}

const sessions = new Map<string, SessionEntry>();
const sessionCreationsByIp = new Map<string, number[]>();

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, games: sessions.size });
});

app.get("/api/config", (_req, res) => {
  res.json({
    network: "testnet",
    contractId: config.contractId,
    stake: STAKE.toString(),
    maxRounds: config.maxRounds,
    players: config.players,
    demoMode: config.demoMode,
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      persona: agent.persona,
      accountId: agent.accountId,
    })),
  });
});

app.get("/api/agents", async (_req, res) => {
  try {
    const profiles = await Promise.all(
      agents.map(async (agent) => {
        const [stats, balance] = await Promise.all([
          getAgentStats(agent.accountId).catch(() => null),
          balanceYocto(agent.accountId).catch(() => 0n),
        ]);
        return {
          id: agent.id,
          name: agent.name,
          persona: agent.persona,
          accountId: agent.accountId,
          balance: balance.toString(),
          stats,
        };
      }),
    );
    res.json({ agents: profiles });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Thin JSON-RPC relay so the browser only needs to reach this origin. */
app.post("/api/rpc", async (req, res) => {
  const started = Date.now();
  const method = String(req.body?.method ?? "unknown");
  const controller = new AbortController();
  // FastNear can take ~30s before returning a 408 while the transaction still
  // lands. Aborting earlier cancels the broadcast entirely, so this is only a
  // safety net for a hung connection.
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    const text = await response.text();
    const elapsed = Date.now() - started;
    if (elapsed > 3_000) {
      console.log(`[rpc] ${method} took ${elapsed}ms (status ${response.status})`);
    }
    if (!response.ok) {
      // Relaying an HTTP error surfaces as a browser console error, and some
      // upstream bodies do not parse. Return a NEAR-shaped JSON-RPC error with
      // HTTP 200; near-api-js keeps the message only in this shape.
      const message =
        response.status === 408
          ? "Testnet RPC timed out; the transaction may still land"
          : `RPC upstream returned ${response.status}; the transaction may still land`;
      res.status(200).type("application/json").send(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            name: "INTERNAL_ERROR",
            cause: { info: { error_message: message } },
          },
          id: req.body?.id ?? "unknown",
        }),
      );
      return;
    }
    res.status(response.status);
    res.type("application/json");
    res.send(text);
  } catch (error) {
    console.log(`[rpc] ${method} failed after ${Date.now() - started}ms: ${String(error)}`);
    res.status(200).json({
      jsonrpc: "2.0",
      error: {
        name: "INTERNAL_ERROR",
        cause: { info: { error_message: `RPC relay failed: ${String(error)}` } },
      },
      id: req.body?.id ?? "unknown",
    });
  } finally {
    clearTimeout(timer);
  }
});

const webDist = join(config.root, "web", "dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback, but never swallow API or socket.io routes.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io/")) {
      return next();
    }
    res.sendFile(join(webDist, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: [config.webOrigin, "http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
  },
});

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (sessionCreationsByIp.get(ip) ?? []).filter(
    (time) => now - time < 60 * 60 * 1000,
  );
  if (recent.length >= 20) {
    sessionCreationsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  sessionCreationsByIp.set(ip, recent);
  return false;
}

function makeRoomId(): string {
  return `demo-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
}

function sessionInfo(roomId: string, accountId: string, publicKey: string): SessionInfo {
  return {
    accountId,
    publicKey,
    roomId,
    stake: STAKE.toString(),
    contractId: config.contractId,
    rpcUrl: "/api/rpc",
  };
}

io.on("connection", (socket) => {
  socket.on(
    "session:create",
    async (payload: { publicKey?: unknown }, ack?: (result: SessionResponse) => void) => {
      try {
        const started = Date.now();
        console.log(`[session] create requested (${payload?.publicKey ?? "no key"})`);
        const ip = socket.handshake.address || "unknown";
        if (rateLimited(ip)) throw new Error("Too many sessions from this address; try again later.");
        if (sessions.size >= config.maxSessions) {
          throw new Error("Demo capacity reached; try again shortly.");
        }
        if (typeof payload?.publicKey !== "string") throw new Error("Missing public key");
        const publicKey = PublicKey.fromString(payload.publicKey).toString();

        const accountId = await createSessionAccount(publicKey);
        const roomId = makeRoomId();
        const session = sessionInfo(roomId, accountId, publicKey);
        sessions.set(roomId, { session, engine: null, createdAt: Date.now() });
        socket.data.session = session;
        socket.data.roomId = roomId;
        socket.join(roomId);
        console.log(`[session] created ${accountId} room=${roomId} in ${Date.now() - started}ms`);
        ack?.({ ok: true, session });
      } catch (error) {
        console.error("[session] create failed", error);
        ack?.({ ok: false, error: String(error) });
      }
    },
  );

  socket.on(
    "game:start",
    async (payload: { roomId?: unknown }, ack?: (result: { ok: boolean; error?: string }) => void) => {
      try {
        const roomId = typeof payload?.roomId === "string" ? payload.roomId : "";
        const session = socket.data.session as SessionInfo | undefined;
        const entry = sessions.get(roomId);
        if (!entry || !session || entry.session.accountId !== session.accountId) {
          throw new Error("Unknown game session; create a session first.");
        }
        console.log(`[game] start requested for ${roomId}`);
        socket.join(roomId);
        if (!entry.engine) {
          entry.engine = new GameSession(
            io,
            roomId,
            entry.session.accountId,
            socket.id,
          );
        } else {
          entry.engine.setHumanSocket(socket.id);
        }
        void entry.engine.start();
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: String(error) });
      }
    },
  );

  socket.on(
    "game:watch",
    async (
      payload: { roomId?: unknown },
      ack?: (result: { ok: boolean; error?: string; hasEngine?: boolean }) => void,
    ) => {
      try {
        const roomId = typeof payload?.roomId === "string" ? payload.roomId : "";
        const entry = sessions.get(roomId);
        if (!entry) throw new Error("Game not found on this server");
        socket.join(roomId);
        socket.data.session = entry.session;
        socket.data.roomId = roomId;
        if (entry.engine) {
          entry.engine.setHumanSocket(socket.id);
          entry.engine.sendStateTo(socket.id);
        }
        ack?.({ ok: true, hasEngine: Boolean(entry.engine) });
      } catch (error) {
        ack?.({ ok: false, error: String(error) });
      }
    },
  );

  socket.on("game:ping", (_payload, ack?: (value: number) => void) => {
    ack?.(Date.now());
  });
});

httpServer.listen(config.port, () => {
  console.log(
    `Agent Undercover server listening on http://localhost:${config.port} (${config.demoMode}, contract ${config.contractId})`,
  );
});

process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
