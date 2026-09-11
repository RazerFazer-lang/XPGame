import { Room, Client } from "colyseus";
import { GAME, WAVE } from "../../../shared/src/constants.js";
import { GameState, PlayerState } from "../state/GameState.js";
import { createEnemy, fireProjectile } from "../game/CombatSystem.js";
import { simulateCombat } from "../game/SimulationSystem.js";

interface JoinOptions { name?: string; }
interface InputMessage { dx?: number; dy?: number; }
interface AimMessage { x?: number; y?: number; }

export class GameRoom extends Room<GameState> {
  maxClients = GAME.maxPlayers;
  private enemyId = 0;
  private projectileId = 0;

  onCreate() {
    this.setState(new GameState());
    this.autoDispose = true;
    this.onMessage("ready", (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.ready = Boolean(ready);
      const players = Array.from(this.state.players.values());
      if (this.state.phase === "lobby" && players.length > 0 && players.every((p) => p.ready)) {
        this.state.phase = "playing";
        this.state.wave = 1;
        this.state.elapsedMs = 0;
      }
    });
    this.onMessage("input", (client, message: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing") return;
      const dx = Math.max(-1, Math.min(1, Number(message?.dx ?? 0)));
      const dy = Math.max(-1, Math.min(1, Number(message?.dy ?? 0)));
      const length = Math.hypot(dx, dy) || 1;
      const dt = 1 / GAME.serverHz;
      player.x = Math.max(40, Math.min(GAME.width - 40, player.x + (dx / length) * GAME.playerSpeed * dt));
      player.y = Math.max(40, Math.min(GAME.height - 40, player.y + (dy / length) * GAME.playerSpeed * dt));
    });
    this.onMessage("aim", (client, message: AimMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const dx = Number(message?.x ?? player.x + 1) - player.x;
      const dy = Number(message?.y ?? player.y) - player.y;
      const length = Math.hypot(dx, dy) || 1;
      player.aimX = dx / length;
      player.aimY = dy / length;
    });
    this.onMessage("fire", (client) => { fireProjectile(this.state, client.sessionId, () => `p_${this.projectileId++}`); });
    this.setSimulationInterval((deltaMs) => this.tick(deltaMs), 1000 / GAME.serverHz);
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState();
    player.name = typeof options?.name === "string" && options.name.trim() ? options.name.trim().slice(0, 18) : `Player ${this.clients.length}`;
    player.x = 300 + this.clients.length * 80;
    player.y = 540;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.players.size === 0) this.state.phase = "lobby";
  }

  private tick(deltaMs: number) {
    if (this.state.phase !== "playing") return;
    this.state.elapsedMs += deltaMs;
    this.state.spawnTimerMs += deltaMs;
    this.state.wave = Math.floor(this.state.elapsedMs / WAVE.firstDurationMs) + 1;
    const spawnInterval = Math.max(180, 1000 - this.state.wave * 35);
    while (this.state.spawnTimerMs >= spawnInterval) {
      this.state.spawnTimerMs -= spawnInterval;
      this.state.enemies.set(`e_${this.enemyId++}`, createEnemy(this.state.wave));
    }
    for (const player of this.state.players.values()) player.attackTimerMs = Math.max(0, player.attackTimerMs - deltaMs);
    simulateCombat(this.state, deltaMs);
  }
}
