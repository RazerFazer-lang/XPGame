import http from "node:http";
import { Server, WebSocketTransport } from "colyseus";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const httpServer = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("XPGame multiplayer server is running.\n");
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);

httpServer.listen(port, host, () => {
  console.log(`[XPGame] Server listening on http://${host}:${port}`);
  console.log(`[XPGame] LAN/Hamachi clients should use the host machine's reachable IP on port ${port}.`);
});
