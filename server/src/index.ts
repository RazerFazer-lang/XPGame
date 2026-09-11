import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, WebSocketTransport } from "colyseus";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
// Compiled server entry: server/dist/server/src/index.js
// Project web client:     dist/index.html
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const webRoot = path.join(projectRoot, "dist");
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
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, service: "XPGame", multiplayer: true }));
    return;
  }

  if (!fs.existsSync(webRoot)) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("XPGame server is running, but the web client build is missing. Run `npm run build`.\n");
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

httpServer.listen(port, host, () => {
  console.log(`[XPGame] Server listening on http://${host}:${port}`);
  console.log(`[XPGame] Health check: http://${host}:${port}/health`);
  console.log(`[XPGame] Game + multiplayer websocket share port ${port}.`);
  console.log(`[XPGame] Web client root: ${webRoot}`);
});
