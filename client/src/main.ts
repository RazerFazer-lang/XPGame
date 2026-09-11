import Phaser from "phaser";
import { Client } from "@colyseus/sdk";
import { GAME } from "../../shared/src/constants";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">XPGame</div>
        <h1>Horde Protocol</h1>
      </div>
      <div id="connection" class="status">OFFLINE</div>
    </header>
    <section class="controls">
      <input id="name" maxlength="18" value="Player" aria-label="Spielername" />
      <button id="connect" type="button">HOST / JOIN</button>
      <button id="ready" type="button" disabled>READY</button>
    </section>
    <div id="game" class="game"></div>
    <aside class="sidepanel">
      <div><span>Phase</span><strong id="phase">LOBBY</strong></div>
      <div><span>Wave</span><strong id="wave">0</strong></div>
      <div><span>Players</span><strong id="players">0 / ${GAME.maxPlayers}</strong></div>
      <div class="hint">WASD zum Bewegen. Erst alle Spieler bereit, dann startet der Run.</div>
    </aside>
  </div>
`;

const connectionEl = document.querySelector<HTMLDivElement>("#connection")!;
const phaseEl = document.querySelector<HTMLElement>("#phase")!;
const waveEl = document.querySelector<HTMLElement>("#wave")!;
const playersEl = document.querySelector<HTMLElement>("#players")!;
const nameInput = document.querySelector<HTMLInputElement>("#name")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const readyButton = document.querySelector<HTMLButtonElement>("#ready")!;

let room: Awaited<ReturnType<Client["joinOrCreate"]>> | null = null;
let localSessionId = "";
let ready = false;

class MainScene extends Phaser.Scene {
  private playerGraphics = new Map<string, Phaser.GameObjects.Arc>();

  constructor() {
    super("main");
  }

  create() {
    this.cameras.main.setBackgroundColor("#070b16");
    this.add.rectangle(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 0x0b1222);
    this.add.grid(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 64, 64, undefined, 0, 0x1b2a48, 0.24);
  }

  syncPlayers(players: Map<string, { x: number; y: number }>) {
    const seen = new Set<string>();
    for (const [id, player] of players) {
      seen.add(id);
      let marker = this.playerGraphics.get(id);
      if (!marker) {
        marker = this.add.circle(player.x, player.y, 18, id === localSessionId ? 0x67e8f9 : 0x8b5cf6);
        marker.setStrokeStyle(3, 0xffffff, 0.8);
        this.playerGraphics.set(id, marker);
      }
      marker.setPosition(player.x, player.y);
    }
    for (const [id, marker] of this.playerGraphics) {
      if (!seen.has(id)) {
        marker.destroy();
        this.playerGraphics.delete(id);
      }
    }
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME.width,
  height: GAME.height,
  backgroundColor: "#070b16",
  scene: [MainScene],
  render: { antialias: true, pixelArt: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

async function connect() {
  connectionEl.textContent = "CONNECTING...";
  connectButton.disabled = true;
  try {
    const client = new Client(`${location.protocol}//${location.host}`);
    room = await client.joinOrCreate("game", { name: nameInput.value.trim() || "Player" });
    localSessionId = room.sessionId;
    readyButton.disabled = false;
    connectionEl.textContent = "CONNECTED";

    room.onStateChange((state: any) => {
      phaseEl.textContent = String(state.phase).toUpperCase();
      waveEl.textContent = String(state.wave);
      playersEl.textContent = `${state.players.size} / ${GAME.maxPlayers}`;
      const players = new Map<string, { x: number; y: number }>();
      state.players.forEach((p: { x: number; y: number }, id: string) => players.set(id, p));
      const scene = game.scene.getScene("main") as MainScene;
      scene.syncPlayers(players);
    });

    room.onLeave(() => {
      connectionEl.textContent = "DISCONNECTED";
      readyButton.disabled = true;
      room = null;
    });
  } catch (error) {
    console.error(error);
    connectionEl.textContent = "CONNECTION ERROR";
    connectButton.disabled = false;
  }
}

connectButton.addEventListener("click", () => void connect());
readyButton.addEventListener("click", () => {
  if (!room) return;
  ready = !ready;
  readyButton.textContent = ready ? "READY ✓" : "READY";
  room.send("ready", ready);
});

const keys = new Set<string>();
window.addEventListener("keydown", (event) => keys.add(event.key.toLowerCase()));
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

setInterval(() => {
  if (!room) return;
  let dx = 0;
  let dy = 0;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (dx !== 0 || dy !== 0) room.send("input", { dx, dy });
}, 1000 / GAME.serverHz);
