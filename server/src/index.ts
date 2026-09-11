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

function sendFile(res: any, file: string, cacheControl: string) {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.status(404).send("Not found\n");
      return;
    }
    res.set("content-type", contentTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.set("cache-control", cacheControl);
    res.send(fs.readFileSync(file));
  } catch {
    res.status(500).send("Internal server error\n");
  }
}

// Colyseus' WebSocketTransport exposes an Express-compatible HTTP app.
// Using it for both the game UI and Colyseus routes keeps matchmaking and
// the browser client on one origin/port without competing raw request handlers.
const httpServer = http.createServer();
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  express: (app) => {
    app.disable("x-powered-by");

    app.get("/health", (_req: any, res: any) => {
      res.set("cache-control", "no-store").json({ ok: true, service: "XPGame", multiplayer: true });
    });

    app.get("/", (_req: any, res: any) => {
      if (!fs.existsSync(webRoot)) {
        res.status(503).type("text/plain").send("XPGame server is running, but the web client has not been built yet. Run `npm run build`.\n");
        return;
      }
      sendFile(res, path.join(webRoot, "index.html"), "no-cache");
    });

    app.get(/^\/assets\/(.+)$/, (req: any, res: any) => {
      const relative = decodeURIComponent(String(req.params[0] ?? ""));
      const candidate = path.resolve(webRoot, "assets", relative);
      if (!candidate.startsWith(path.join(webRoot, "assets") + path.sep)) {
        res.status(400).type("text/plain").send("Bad request\n");
        return;
      }
      sendFile(res, candidate, "public, max-age=31536000, immutable");
    });

    app.get("/favicon.ico", (_req: any, res: any) => {
      sendFile(res, path.join(webRoot, "favicon.ico"), "public, max-age=31536000, immutable");
    });
  },
});

gameServer.define("game", GameRoom);

void gameServer.listen(port, host).then(() => {
  console.log(`[XPGame] Server listening on ${host}:${port}`);
  console.log(`[XPGame] Codespaces: open the forwarded port ${port} from the PORTS panel; do not open 0.0.0.0 directly.`);
  console.log(`[XPGame] Health check: /health`);
  console.log(`[XPGame] Matchmaking: /matchmake/*`);
  console.log(`[XPGame] Game + multiplayer websocket share port ${port}.`);
  console.log(`[XPGame] Web client root: ${webRoot}`);
}).catch(error => {
  console.error("[XPGame] Failed to start server:", error);
  process.exitCode = 1;
});
