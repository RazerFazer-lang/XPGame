import Phaser from "phaser";
import { Client } from "@colyseus/sdk";
import { GAME } from "../../shared/src/constants";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div><div class="eyebrow">XPGame</div><h1>Horde Protocol</h1></div><div id="connection" class="status">OFFLINE</div></header>
    <section class="controls"><input id="name" maxlength="18" value="Player" aria-label="Spielername" /><button id="connect" type="button">HOST / JOIN</button><button id="ready" type="button" disabled>READY</button></section>
    <div id="game" class="game"></div>
    <aside class="sidepanel">
      <div><span>Phase</span><strong id="phase">LOBBY</strong></div><div><span>Wave</span><strong id="wave">0</strong></div><div><span>Players</span><strong id="players">0 / ${GAME.maxPlayers}</strong></div>
      <div><span>Level</span><strong id="level">1</strong></div><div><span>XP</span><strong id="xp">0 / 100</strong></div><div><span>HP</span><strong id="hp">100 / 100</strong></div>
      <div class="hint">WASD bewegen · Maus zielen · Linksklick feuern</div>
    </aside>
  </div>`;

const connectionEl = document.querySelector<HTMLDivElement>("#connection")!;
const phaseEl = document.querySelector<HTMLElement>("#phase")!;
const waveEl = document.querySelector<HTMLElement>("#wave")!;
const playersEl = document.querySelector<HTMLElement>("#players")!;
const levelEl = document.querySelector<HTMLElement>("#level")!;
const xpEl = document.querySelector<HTMLElement>("#xp")!;
const hpEl = document.querySelector<HTMLElement>("#hp")!;
const nameInput = document.querySelector<HTMLInputElement>("#name")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const readyButton = document.querySelector<HTMLButtonElement>("#ready")!;

let room: any = null;
let localSessionId = "";
let ready = false;

class MainScene extends Phaser.Scene {
  private players = new Map<string, Phaser.GameObjects.Arc>();
  private enemies = new Map<string, Phaser.GameObjects.Arc>();
  private projectiles = new Map<string, Phaser.GameObjects.Arc>();
  constructor() { super("main"); }

  create() {
    this.cameras.main.setBackgroundColor("#070b16");
    this.add.rectangle(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 0x0b1222);
    this.add.grid(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 64, 64, 0x101827, 1, 0x1b2a48, 0.24);
  }

  sync(state: any) {
    const seenPlayers = new Set<string>();
    state.players.forEach((player: any, id: string) => {
      seenPlayers.add(id);
      let marker = this.players.get(id);
      if (!marker) {
        marker = this.add.circle(player.x, player.y, 18, id === localSessionId ? 0x67e8f9 : 0x8b5cf6);
        marker.setStrokeStyle(3, 0xffffff, 0.8);
        this.players.set(id, marker);
      }
      marker.setPosition(player.x, player.y);
    });
    this.removeMissing(this.players, seenPlayers);

    const seenEnemies = new Set<string>();
    state.enemies.forEach((enemy: any, id: string) => {
      seenEnemies.add(id);
      let marker = this.enemies.get(id);
      if (!marker) {
        marker = this.add.circle(enemy.x, enemy.y, enemy.radius ?? 16, 0xf43f5e);
        marker.setStrokeStyle(2, 0xffc0cb, 0.65);
        this.enemies.set(id, marker);
      }
      marker.setPosition(enemy.x, enemy.y);
    });
    this.removeMissing(this.enemies, seenEnemies);

    const seenProjectiles = new Set<string>();
    state.projectiles.forEach((projectile: any, id: string) => {
      seenProjectiles.add(id);
      let marker = this.projectiles.get(id);
      if (!marker) {
        marker = this.add.circle(projectile.x, projectile.y, 5, 0xfef08a);
        this.projectiles.set(id, marker);
      }
      marker.setPosition(projectile.x, projectile.y);
    });
    this.removeMissing(this.projectiles, seenProjectiles);
  }

  private removeMissing<T extends Phaser.GameObjects.GameObject>(map: Map<string, T>, seen: Set<string>) {
    for (const [id, object] of map) {
      if (!seen.has(id)) { object.destroy(); map.delete(id); }
    }
  }
}

const game = new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: GAME.width, height: GAME.height, scene: [MainScene], render: { antialias: true, pixelArt: false }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });

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
      const local = state.players.get(localSessionId);
      if (local) {
        levelEl.textContent = String(local.level);
        xpEl.textContent = `${Math.floor(local.xp)} / ${Math.floor(local.xpToNext)}`;
        hpEl.textContent = `${Math.ceil(local.hp)} / ${Math.ceil(local.maxHp)}`;
      }
      (game.scene.getScene("main") as MainScene).sync(state);
    });
    room.onLeave(() => { connectionEl.textContent = "DISCONNECTED"; readyButton.disabled = true; room = null; });
  } catch (error) {
    console.error(error);
    connectionEl.textContent = "CONNECTION ERROR";
    connectButton.disabled = false;
  }
}

connectButton.addEventListener("click", () => void connect());
readyButton.addEventListener("click", () => { if (!room) return; ready = !ready; readyButton.textContent = ready ? "READY ✓" : "READY"; room.send("ready", ready); });

const keys = new Set<string>();
window.addEventListener("keydown", (event) => keys.add(event.key.toLowerCase()));
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

const gameElement = document.querySelector<HTMLDivElement>("#game")!;
gameElement.addEventListener("mousemove", (event) => {
  if (!room) return;
  const rect = gameElement.getBoundingClientRect();
  room.send("aim", { x: ((event.clientX - rect.left) / rect.width) * GAME.width, y: ((event.clientY - rect.top) / rect.height) * GAME.height });
});
gameElement.addEventListener("mousedown", (event) => { if (event.button === 0 && room) room.send("fire"); });

setInterval(() => {
  if (!room) return;
  let dx = 0; let dy = 0;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (dx !== 0 || dy !== 0) room.send("input", { dx, dy });
}, 1000 / GAME.serverHz);
