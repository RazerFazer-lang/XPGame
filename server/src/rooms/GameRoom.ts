import { Room, Client } from "colyseus";
import { GAME, WAVE } from "../../../shared/src/constants.js";
import { GameState, PlayerState } from "../state/GameState.js";
import { createEnemy, fireProjectile } from "../game/CombatSystem.js";
import { simulateCombat } from "../game/SimulationSystem.js";
import { applyUpgrade, getUpgradeChoices } from "../game/UpgradeSystem.js";

interface JoinOptions { name?: string; }
interface InputMessage { dx?: number; dy?: number; }
interface AimMessage { x?: number; y?: number; }

export class GameRoom extends Room<{ state: GameState }> {
  state = new GameState();
  maxClients = GAME.maxPlayers;
  private enemyId = 0;
  private projectileId = 0;
  private bossWaveSpawned = new Set<number>();

  onCreate() {
    this.autoDispose = true;

    this.onMessage("ready", (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase === "game_over") return;
      player.ready = Boolean(ready);
      const players = Array.from(this.state.players.values());
      if (this.state.phase === "lobby" && players.length > 0 && players.every(p => p.ready)) {
        this.state.phase = "playing";
        this.state.wave = 1;
        this.state.elapsedMs = 0;
        this.state.spawnTimerMs = 0;
      }
    });

    this.onMessage("chooseUpgrade", (client, id: string) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !id || player.upgradeChoices === "[]" || player.upgradeChoices === "pending") return;
      let choices: string[];
      try {
        choices = JSON.parse(player.upgradeChoices || "[]") as string[];
      } catch {
        return;
      }
      if (!choices.includes(id)) return;
      if (!applyUpgrade(player, id)) return;
      player.pendingUpgradeLevels = Math.max(0, player.pendingUpgradeLevels - 1);
      player.upgradeChoices = player.pendingUpgradeLevels > 0 ? "pending" : "[]";
    });

    this.onMessage("input", (client, message: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing" || player.hp <= 0) return;
      const dx = Math.max(-1, Math.min(1, Number(message?.dx ?? 0)));
      const dy = Math.max(-1, Math.min(1, Number(message?.dy ?? 0)));
      const length = Math.hypot(dx, dy) || 1;
      const dt = 1 / GAME.serverHz;
      player.x = Math.max(40, Math.min(GAME.width - 40, player.x + (dx / length) * player.moveSpeed * dt));
      player.y = Math.max(40, Math.min(GAME.height - 40, player.y + (dy / length) * player.moveSpeed * dt));
    });

    this.onMessage("aim", (client, message: AimMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.hp <= 0) return;
      const dx = Number(message?.x ?? player.x + 1) - player.x;
      const dy = Number(message?.y ?? player.y) - player.y;
      const length = Math.hypot(dx, dy) || 1;
      player.aimX = dx / length;
      player.aimY = dy / length;
    });

    this.onMessage("fire", client => { fireProjectile(this.state, client.sessionId, () => `p_${this.projectileId++}`); });
    this.setSimulationInterval(deltaMs => this.tick(deltaMs), 1000 / GAME.serverHz);
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState();
    player.name = typeof options?.name === "string" && options.name.trim() ? options.name.trim().slice(0, 18) : `Player ${this.clients.length}`;
    player.x = 300 + this.clients.length * 80;
    player.y = 540;
    player.hp = player.maxHp = GAME.startingHp;
    player.damage = GAME.startingDamage;
    player.attackCooldownMs = GAME.startingAttackCooldownMs;
    player.projectileSpeed = GAME.startingProjectileSpeed;
    player.pickupRadius = GAME.startingPickupRadius;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.players.size === 0) this.state.phase = "lobby";
  }

  private populateUpgradeChoices(player: PlayerState) {
    if (player.upgradeChoices !== "pending") return;
    const choices = getUpgradeChoices(player, 3).map(u => u.id);
    player.upgradeChoices = JSON.stringify(choices);
  }

  private spawnWaveContent() {
    const wave = this.state.wave;
    const interval = Math.max(WAVE.minimumSpawnIntervalMs, WAVE.baseSpawnIntervalMs - wave * 24);
    while (this.state.spawnTimerMs >= interval) {
      this.state.spawnTimerMs -= interval;
      const roll = Math.random();
      const kind = wave >= 8 && roll > 0.88 ? "ranged" : wave >= 4 && roll > 0.78 ? "tank" : wave >= 2 && roll > 0.62 ? "fast" : "basic";
      this.state.enemies.set(`e_${this.enemyId++}`, createEnemy(wave, kind));
    }

    if (wave >= WAVE.eliteEvery && wave % WAVE.eliteEvery === 0 && Math.floor(this.state.elapsedMs / WAVE.firstDurationMs) === wave - 1) {
      for (let i = 0; i < Math.min(1 + Math.floor(wave / 10), 3); i++) this.state.enemies.set(`e_${this.enemyId++}`, createEnemy(wave, "elite"));
    }

    if (wave >= WAVE.bossEvery && wave % WAVE.bossEvery === 0 && !this.bossWaveSpawned.has(wave)) {
      this.bossWaveSpawned.add(wave);
      this.state.enemies.set(`boss_${wave}`, createEnemy(wave, "boss"));
    }
  }

  private tick(deltaMs: number) {
    if (this.state.phase !== "playing") return;
    this.state.elapsedMs += deltaMs;
    this.state.spawnTimerMs += deltaMs;
    this.state.wave = Math.floor(this.state.elapsedMs / WAVE.firstDurationMs) + 1;
    for (const player of this.state.players.values()) {
      player.attackTimerMs = Math.max(0, player.attackTimerMs - deltaMs);
      this.populateUpgradeChoices(player);
    }
    this.spawnWaveContent();
    simulateCombat(this.state, deltaMs);
  }
}
