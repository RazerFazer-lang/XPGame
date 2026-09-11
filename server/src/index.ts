import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Server, WebSocketTransport } from "colyseus";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const webRoot = path.resolve(process.cwd(), "dist");
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

function safeWebPath(requestUrl: string) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(webRoot, relative);
  return candidate.startsWith(webRoot + path.sep) ? candidate : null;
}

const httpServer = http.createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, service: "XPGame", multiplayer: true }));
    return;
  }

  // Colyseus owns matchmaking routes. Its router is registered by
  // gameServer.serverless(); this listener must not answer these requests.
  if (pathname === "/matchmake" || pathname.startsWith("/matchmake/") || pathname === "/rooms" || pathname.startsWith("/rooms/")) {
    return;
  }

  if (!fs.existsSync(webRoot)) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("XPGame server is running, but the web client has not been built yet. Run `npm run build`.\n");
    return;
  }

  const file = safeWebPath(req.url ?? "/");
  if (!file) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request\n");
    return;
  }

  const fallback = path.join(webRoot, "index.html");
  let target = fallback;
  try {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) target = file;
    const body = fs.readFileSync(target);
    res.writeHead(200, {
      "content-type": contentTypes[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      "cache-control": path.basename(target) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(body);
  } catch {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal server error\n");
  }
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);

async function startServer(): Promise<void> {
  // Prepare Colyseus matchmaking + HTTP routing without taking ownership of
  // the port. This also pre-reads request bodies for /matchmake POSTs.
  await gameServer.serverless();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once("error", onError);
    httpServer.listen(port, host, () => {
      httpServer.off("error", onError);
      resolve();
    });
  });

  console.log(`[XPGame] Server listening on ${host}:${port}`);
  console.log(`[XPGame] Codespaces: open the forwarded port ${port} from the PORTS panel; do not open 0.0.0.0 directly.`);
  console.log(`[XPGame] Health check: /health`);
  console.log(`[XPGame] Matchmaking: /matchmake/*`);
  console.log(`[XPGame] Game + multiplayer websocket share port ${port}.`);
  console.log(`[XPGame] Web client root: ${webRoot}`);
}

void startServer().catch(error => {
  console.error("[XPGame] Failed to start server:", error);
  process.exitCode = 1;
});
