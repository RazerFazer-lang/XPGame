import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@colyseus/sdk";

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BOT_COUNT = 4;

type BotRoom = Awaited<ReturnType<Client["joinOrCreate"]>>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timeout while waiting for ${label}`);
    await sleep(50);
  }
}

async function waitForHealth(): Promise<void> {
  const started = Date.now();
  let lastError = "unknown";
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        const body = await response.json() as { ok?: boolean; multiplayer?: boolean };
        if (body.ok === true && body.multiplayer === true) return;
        lastError = `unexpected health payload: ${JSON.stringify(body)}`;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`Server health check failed: ${lastError}`);
}

function startServer(): ChildProcess {
  return spawn(process.execPath, ["server/dist/server/src/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForRoomPlayers(room: BotRoom, expected: number, label: string): Promise<void> {
  await waitFor(`${label} to have ${expected} players`, () => Number(room.state?.players?.size ?? 0) === expected, 10_000);
}

async function waitForPhase(room: BotRoom, expected: string, label: string): Promise<void> {
  await waitFor(`${label} phase=${expected}`, () => String(room.state?.phase) === expected, 10_000);
}

test("real multiplayer integration: 4 AI bots connect, sync, play and disconnect", { timeout: 45_000 }, async t => {
  const server = startServer();
  const bots: BotRoom[] = [];
  let stdout = "";
  let stderr = "";
  server.stdout?.on("data", chunk => { stdout += String(chunk); });
  server.stderr?.on("data", chunk => { stderr += String(chunk); });

  t.after(async () => {
    for (const room of bots) {
      try { await room.leave(); } catch {}
    }
    if (!server.killed) server.kill("SIGTERM");
    await sleep(150);
    if (!server.killed) server.kill("SIGKILL");
  });

  await waitForHealth();

  // Bot 1 creates the lobby; bots 2-4 explicitly join the same room.
  const firstClient = new Client(BASE_URL);
  const first = await firstClient.joinOrCreate("game", { name: "AI-Bot-1", mapId: "neon_city" });
  bots.push(first);
  const roomId = first.roomId;

  for (let index = 1; index < BOT_COUNT; index += 1) {
    const client = new Client(BASE_URL);
    bots.push(await client.joinById(roomId, { name: `AI-Bot-${index + 1}`, mapId: "neon_city" }));
  }

  for (const room of bots) await waitForRoomPlayers(room, BOT_COUNT, "multiplayer room");
  assert.equal(new Set(bots.map(room => room.roomId)).size, 1, "all 4 bots must share one room");

  // Exercise lobby leave/rejoin before the run starts.
  const reconnectingBot = bots.pop()!;
  await reconnectingBot.leave();
  await waitForRoomPlayers(bots[0]!, BOT_COUNT - 1, "room after lobby leave");
  const replacementClient = new Client(BASE_URL);
  const replacement = await replacementClient.joinById(roomId, { name: "AI-Reconnect", mapId: "neon_city" });
  bots.push(replacement);
  await waitForRoomPlayers(replacement, BOT_COUNT, "room after lobby reconnect");

  for (const room of bots) room.send("ready", true);
  await waitForPhase(replacement, "playing", "multiplayer room");

  // Simulate four independent AI players sending authoritative input/aim/fire.
  for (let tick = 0; tick < 12; tick += 1) {
    for (const [index, room] of bots.entries()) {
      room.send("input", { dx: index % 2 === 0 ? 1 : -1, dy: index % 3 === 0 ? 1 : 0 });
      room.send("aim", { x: 960 + index * 40, y: 540 });
      room.send("fire");
    }
    await sleep(70);
  }

  await sleep(500);
  assert.equal(replacement.state.players.size, BOT_COUNT, "all bot states must remain synchronized");
  assert.equal(String(replacement.state.phase), "playing");
  assert.ok(Number(replacement.state.wave) >= 1);

  // Validate that a bot can disconnect cleanly and the others keep the room alive.
  const leavingBot = bots.pop()!;
  await leavingBot.leave();
  await waitForRoomPlayers(replacement, BOT_COUNT - 1, "room after active disconnect");
  assert.equal(String(replacement.state.phase), "playing", "remaining players should stay in the run");

  assert.match(stdout, /Server listening on http:\/\/127\.0\.0\.1:3210/);
  assert.doesNotMatch(stderr, /EADDRINUSE|MODULE_NOT_FOUND|SyntaxError/);
});

test("room matchmaking creates a second room when the first one is full", { timeout: 30_000 }, async t => {
  const server = startServer();
  const rooms: BotRoom[] = [];
  let stderr = "";
  server.stderr?.on("data", chunk => { stderr += String(chunk); });

  t.after(async () => {
    for (const room of rooms) {
      try { await room.leave(); } catch {}
    }
    if (!server.killed) server.kill("SIGTERM");
    await sleep(150);
    if (!server.killed) server.kill("SIGKILL");
  });

  await waitForHealth();
  const clients = Array.from({ length: BOT_COUNT + 1 }, () => new Client(BASE_URL));
  const joined: BotRoom[] = [];
  for (let index = 0; index < clients.length; index += 1) {
    joined.push(await clients[index]!.joinOrCreate("game", { name: `Capacity-Bot-${index + 1}` }));
  }
  rooms.push(...joined);

  const firstRoomId = joined[0]!.roomId;
  assert.equal(joined.slice(0, BOT_COUNT).every(room => room.roomId === firstRoomId), true);
  assert.notEqual(joined[BOT_COUNT]!.roomId, firstRoomId, "fifth matchmaking client must use a second room");
  assert.doesNotMatch(stderr, /EADDRINUSE|MODULE_NOT_FOUND|SyntaxError/);
});
