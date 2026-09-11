import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@colyseus/sdk";

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

async function waitForHealth(baseUrl: string): Promise<void> {
  const started = Date.now();
  let lastError = "unknown";
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(`${baseUrl}/health`);
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

function startServer(port: number): ChildProcess {
  return spawn(process.execPath, ["server/dist/server/src/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function diagnoseJoinFailure(baseUrl: string, label: string, error: unknown, stdout: string, stderr: string): Promise<never> {
  let probe = "probe failed before receiving a response";
  try {
    const response = await fetch(`${baseUrl}/matchmake/joinOrCreate/game`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ name: "HTTP-Probe", mapId: "neon_city" }),
    });
    probe = `HTTP ${response.status}: ${await response.text()}`;
  } catch (probeError) {
    probe = `HTTP probe error: ${probeError instanceof Error ? probeError.stack ?? probeError.message : String(probeError)}`;
  }

  throw new Error([
    `${label} failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `Direct matchmaking probe: ${probe}`,
    `Server stdout:\n${stdout || "<empty>"}`,
    `Server stderr:\n${stderr || "<empty>"}`,
  ].join("\n\n"));
}

async function waitForRoomPlayers(room: BotRoom, expected: number, label: string): Promise<void> {
  await waitFor(`${label} to have ${expected} players`, () => Number(room.state?.players?.size ?? 0) === expected, 10_000);
}

async function waitForPhase(room: BotRoom, expected: string, label: string): Promise<void> {
  await waitFor(`${label} phase=${expected}`, () => String(room.state?.phase) === expected, 10_000);
}

test("real multiplayer integration: 4 AI bots connect, sync, play and disconnect", { timeout: 45_000 }, async t => {
  const port = 3210;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
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

  await waitForHealth(baseUrl);

  // Bot 1 creates the lobby; bots 2-4 use normal quick-match matchmaking.
  for (let index = 0; index < BOT_COUNT; index += 1) {
    const client = new Client(baseUrl);
    try {
      bots.push(await client.joinOrCreate("game", { name: `AI-Bot-${index + 1}`, mapId: "neon_city" }));
    } catch (error) {
      await diagnoseJoinFailure(baseUrl, `AI-Bot-${index + 1} joinOrCreate`, error, stdout, stderr);
    }
  }

  const roomId = bots[0]!.roomId;
  assert.equal(new Set(bots.map(room => room.roomId)).size, 1, "all 4 bots must share one room");
  assert.equal(roomId.length > 0, true);
  for (const room of bots) await waitForRoomPlayers(room, BOT_COUNT, "multiplayer room");

  // Malformed payloads must be ignored without mutating the lobby or crashing the room.
  bots[0]!.send("ready", "true");
  bots[0]!.send("input", null);
  bots[0]!.send("aim", []);
  bots[0]!.send("weapon", 42);
  bots[0]!.send("chooseUpgrade", {});
  await sleep(100);
  assert.equal(String(bots[0]!.state.phase), "lobby");
  assert.equal(bots[0]!.state.players.get(bots[0]!.sessionId)?.ready, false);

  // Exercise lobby leave/rejoin before the run starts.
  const reconnectingBot = bots.pop()!;
  await reconnectingBot.leave();
  await waitForRoomPlayers(bots[0]!, BOT_COUNT - 1, "room after lobby leave");
  const replacementClient = new Client(baseUrl);
  let replacement: BotRoom;
  try {
    replacement = await replacementClient.joinOrCreate("game", { name: "AI-Reconnect", mapId: "neon_city" });
  } catch (error) {
    await diagnoseJoinFailure(baseUrl, "AI-Reconnect joinOrCreate", error, stdout, stderr);
  }
  bots.push(replacement!);
  assert.equal(replacement!.roomId, roomId, "quick-match reconnect should reuse the open lobby room");
  await waitForRoomPlayers(replacement!, BOT_COUNT, "room after lobby reconnect");

  for (const room of bots) room.send("ready", true);
  await waitForPhase(replacement!, "playing", "multiplayer room");

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
  assert.equal(replacement!.state.players.size, BOT_COUNT, "all bot states must remain synchronized");
  assert.equal(String(replacement!.state.phase), "playing");
  assert.ok(Number(replacement!.state.wave) >= 1);

  // Disconnect a different bot than the observer so the observer remains subscribed to state updates.
  const leavingBot = bots[0]!;
  bots.splice(0, 1);
  await leavingBot.leave();
  await waitForRoomPlayers(replacement!, BOT_COUNT - 1, "room after active disconnect");
  assert.equal(String(replacement!.state.phase), "playing", "remaining players should stay in the run");

  assert.match(stdout, new RegExp(`Server listening on 127\\.0\\.0\\.1:${port}`));
  assert.doesNotMatch(stderr, /EADDRINUSE|MODULE_NOT_FOUND|SyntaxError/);
});

test("room matchmaking creates a second room when the first one is full", { timeout: 30_000 }, async t => {
  const port = 3211;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  const rooms: BotRoom[] = [];
  let stdout = "";
  let stderr = "";
  server.stdout?.on("data", chunk => { stdout += String(chunk); });
  server.stderr?.on("data", chunk => { stderr += String(chunk); });

  t.after(async () => {
    for (const room of rooms) {
      try { await room.leave(); } catch {}
    }
    if (!server.killed) server.kill("SIGTERM");
    await sleep(150);
    if (!server.killed) server.kill("SIGKILL");
  });

  await waitForHealth(baseUrl);
  const clients = Array.from({ length: BOT_COUNT + 1 }, () => new Client(baseUrl));
  const joined: BotRoom[] = [];
  for (let index = 0; index < clients.length; index += 1) {
    try {
      joined.push(await clients[index]!.joinOrCreate("game", { name: `Capacity-Bot-${index + 1}` }));
    } catch (error) {
      await diagnoseJoinFailure(baseUrl, `Capacity-Bot-${index + 1} joinOrCreate`, error, stdout, stderr);
    }
  }
  rooms.push(...joined);

  const firstRoomId = joined[0]!.roomId;
  assert.equal(joined.slice(0, BOT_COUNT).every(room => room.roomId === firstRoomId), true);
  assert.notEqual(joined[BOT_COUNT]!.roomId, firstRoomId, "fifth matchmaking client must use a second room");
  assert.doesNotMatch(stderr, /EADDRINUSE|MODULE_NOT_FOUND|SyntaxError/);
});
