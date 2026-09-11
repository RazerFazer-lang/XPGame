import Phaser from "phaser";
import { Client } from "@colyseus/sdk";
import { GAME } from "../../shared/src/constants";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");
const serverUrl = `${location.protocol}//${location.hostname}:${import.meta.env.VITE_GAME_SERVER_PORT ?? "3000"}`;

app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div><div class="eyebrow">XPGame // HORDE PROTOCOL</div><h1>Survive the wave.</h1></div><div id="connection" class="status">OFFLINE</div></header>
    <section class="controls"><input id="name" maxlength="18" value="Player" aria-label="Spielername" /><button id="connect" type="button">CONNECT</button><button id="ready" type="button" disabled>READY</button></section>
    <div id="game" class="game"></div>
    <aside class="sidepanel">
      <div><span>Phase</span><strong id="phase">LOBBY</strong></div><div><span>Wave</span><strong id="wave">0</strong></div><div><span>Players</span><strong id="players">0 / ${GAME.maxPlayers}</strong></div><div><span>Level</span><strong id="level">1</strong></div><div><span>XP</span><strong id="xp">0 / 100</strong></div><div><span>HP</span><strong id="hp">100 / 100</strong></div><div><span>Kills</span><strong id="kills">0</strong></div>
      <div class="hint">WASD bewegen · Maus zielen · Linksklick feuern · Upgrade-Karte auswählen</div>
    </aside>
    <div id="upgradeOverlay" class="overlay hidden" aria-live="polite"><div class="upgradePanel"><div class="eyebrow">LEVEL UP</div><h2>Choose an upgrade</h2><div id="upgradeCards" class="upgradeCards"></div></div></div>
  </div>`;

const connectionEl = document.querySelector<HTMLDivElement>("#connection")!;
const phaseEl = document.querySelector<HTMLElement>("#phase")!;
const waveEl = document.querySelector<HTMLElement>("#wave")!;
const playersEl = document.querySelector<HTMLElement>("#players")!;
const levelEl = document.querySelector<HTMLElement>("#level")!;
const xpEl = document.querySelector<HTMLElement>("#xp")!;
const hpEl = document.querySelector<HTMLElement>("#hp")!;
const killsEl = document.querySelector<HTMLElement>("#kills")!;
const nameInput = document.querySelector<HTMLInputElement>("#name")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const readyButton = document.querySelector<HTMLButtonElement>("#ready")!;
const overlay = document.querySelector<HTMLDivElement>("#upgradeOverlay")!;
const upgradeCards = document.querySelector<HTMLDivElement>("#upgradeCards")!;

let room: any = null;
let localSessionId = "";
let ready = false;
let lastUpgradeSignature = "";

const upgradeCatalog: Record<string, { title: string; description: string; rarity: string }> = {
  heavy_bullets: { title: "Heavy Bullets", description: "+20% damage", rarity: "COMMON" }, rapid_fire: { title: "Rapid Fire", description: "12% faster attacks", rarity: "COMMON" },
  twin_shot: { title: "Twin Shot", description: "+1 projectile", rarity: "UNCOMMON" }, piercing: { title: "Piercing", description: "+1 pierce", rarity: "UNCOMMON" }, velocity: { title: "Velocity", description: "+20% projectile speed", rarity: "COMMON" },
  adrenaline: { title: "Adrenaline", description: "+15% movement speed", rarity: "COMMON" }, magnet: { title: "Magnet", description: "+45 pickup radius", rarity: "COMMON" }, vitality: { title: "Vitality", description: "+25 max HP and heal", rarity: "COMMON" },
  armor: { title: "Armor Plating", description: "Reduce incoming damage", rarity: "UNCOMMON" }, critical: { title: "Critical Strike", description: "+8% crit chance", rarity: "RARE" }, deadeye: { title: "Deadeye", description: "+35% crit damage", rarity: "RARE" }, overclock: { title: "Overclock", description: "18% faster attacks and +8% damage", rarity: "EPIC" },
};

class MainScene extends Phaser.Scene {
  private players = new Map<string, Phaser.GameObjects.Arc>(); private enemies = new Map<string, Phaser.GameObjects.Arc>(); private projectiles = new Map<string, Phaser.GameObjects.Arc>(); private xpDrops = new Map<string, Phaser.GameObjects.Arc>();
  constructor() { super("main"); }
  create() { this.cameras.main.setBackgroundColor("#070b16"); this.add.rectangle(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 0x0b1222); this.add.grid(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 64, 64, 0x101827, 1, 0x1b2a48, 0.24); }
  sync(state: any) {
    this.syncMap(state.players, this.players, (id: string, p: any) => { const marker = this.add.circle(p.x, p.y, 18, id === localSessionId ? 0x67e8f9 : 0x8b5cf6); marker.setStrokeStyle(3, 0xffffff, 0.8); return marker; });
    this.syncMap(state.enemies, this.enemies, (_id: string, e: any) => { const colors: Record<string, number> = { basic: 0xf43f5e, fast: 0xfb923c, tank: 0x94a3b8, ranged: 0xa78bfa, elite: 0xfacc15, boss: 0xef4444 }; const marker = this.add.circle(e.x, e.y, e.radius ?? 16, colors[e.kind] ?? 0xf43f5e); marker.setStrokeStyle(e.boss ? 5 : e.elite ? 3 : 2, e.boss ? 0xfef2f2 : 0xffffff, 0.8); return marker; });
    this.syncMap(state.projectiles, this.projectiles, (_id: string, p: any) => this.add.circle(p.x, p.y, 5, 0xfef08a));
    this.syncMap(state.xpDrops, this.xpDrops, (_id: string, drop: any) => { const marker = this.add.circle(drop.x, drop.y, 6, 0x22d3ee); marker.setStrokeStyle(2, 0xcffafe, 0.9); return marker; });
  }
  private syncMap<T extends Phaser.GameObjects.GameObject>(source: any, target: Map<string, T>, create: (id: string, data: any) => T) {
    const seen = new Set<string>(); source.forEach((data: any, id: string) => { seen.add(id); let marker = target.get(id); if (!marker) { marker = create(id, data); target.set(id, marker); } (marker as any).setPosition(data.x, data.y); });
    for (const [id, marker] of target) { if (!seen.has(id)) { marker.destroy(); target.delete(id); } }
  }
}

const game = new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: GAME.width, height: GAME.height, scene: [MainScene], render: { antialias: true, pixelArt: false }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });

function renderUpgradeChoices(ids: string[]) {
  const signature = ids.join("|"); if (signature === lastUpgradeSignature || ids.length === 0) return; lastUpgradeSignature = signature; overlay.classList.remove("hidden"); upgradeCards.innerHTML = "";
  ids.forEach((id, index) => { const info = upgradeCatalog[id] ?? { title: id, description: "Upgrade", rarity: "COMMON" }; const button = document.createElement("button"); button.className = "upgradeCard"; button.type = "button"; button.innerHTML = `<span class="rarity">${info.rarity}</span><strong>${index + 1}. ${info.title}</strong><span>${info.description}</span>`; button.addEventListener("click", () => { room?.send("chooseUpgrade", id); overlay.classList.add("hidden"); lastUpgradeSignature = ""; }); upgradeCards.appendChild(button); });
}

async function connect() {
  connectionEl.textContent = "CONNECTING..."; connectButton.disabled = true;
  try {
    const client = new Client(serverUrl); room = await client.joinOrCreate("game", { name: nameInput.value.trim() || "Player" }); localSessionId = room.sessionId; readyButton.disabled = false; connectionEl.textContent = "CONNECTED";
    room.onStateChange((state: any) => {
      phaseEl.textContent = String(state.phase).toUpperCase(); waveEl.textContent = String(state.wave); playersEl.textContent = `${state.players.size} / ${GAME.maxPlayers}`;
      const local = state.players.get(localSessionId); if (local) { levelEl.textContent = String(local.level); xpEl.textContent = `${Math.floor(local.xp)} / ${Math.floor(local.xpToNext)}`; hpEl.textContent = `${Math.ceil(local.hp)} / ${Math.ceil(local.maxHp)}`; killsEl.textContent = String(local.kills); if (local.upgradeChoices && local.upgradeChoices !== "[]" && local.upgradeChoices !== "pending") { try { renderUpgradeChoices(JSON.parse(local.upgradeChoices) as string[]); } catch { overlay.classList.add("hidden"); } } }
      (game.scene.getScene("main") as MainScene).sync(state);
    });
    room.onLeave(() => { connectionEl.textContent = "DISCONNECTED"; readyButton.disabled = true; room = null; overlay.classList.add("hidden"); });
  } catch (error) { console.error(error); connectionEl.textContent = "CONNECTION ERROR"; connectButton.disabled = false; }
}

connectButton.addEventListener("click", () => void connect());
readyButton.addEventListener("click", () => { if (!room) return; ready = !ready; readyButton.textContent = ready ? "READY ✓" : "READY"; room.send("ready", ready); });
const keys = new Set<string>();
window.addEventListener("keydown", event => keys.add(event.key.toLowerCase())); window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
const gameElement = document.querySelector<HTMLDivElement>("#game")!;
gameElement.addEventListener("mousemove", event => { if (!room) return; const rect = gameElement.getBoundingClientRect(); room.send("aim", { x: ((event.clientX - rect.left) / rect.width) * GAME.width, y: ((event.clientY - rect.top) / rect.height) * GAME.height }); });
gameElement.addEventListener("mousedown", event => { if (event.button === 0 && room) room.send("fire"); });
setInterval(() => { if (!room) return; let dx = 0; let dy = 0; if (keys.has("a") || keys.has("arrowleft")) dx -= 1; if (keys.has("d") || keys.has("arrowright")) dx += 1; if (keys.has("w") || keys.has("arrowup")) dy -= 1; if (keys.has("s") || keys.has("arrowdown")) dy += 1; if (dx !== 0 || dy !== 0) room.send("input", { dx, dy }); }, 1000 / GAME.serverHz);
