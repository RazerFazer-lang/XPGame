import { Room, Client } from "colyseus";
import { EVENTS, GAME, MAPS, WAVE } from "../../../shared/src/constants.js";
import { GameState, PlayerState } from "../state/GameState.js";
import { createEnemy, EnemyKind, fireProjectile } from "../game/CombatSystem.js";
import { simulateCombat } from "../game/SimulationSystem.js";
import { applyUpgrade, getUpgradeChoices } from "../game/UpgradeSystem.js";

interface JoinOptions { name?: string; mapId?: string; }
interface InputMessage { dx?: number; dy?: number; }
interface AimMessage { x?: number; y?: number; }
interface WeaponMessage { weapon?: string; }

const VALID_WEAPONS = new Set(["rifle", "shotgun", "smg", "cannon", "arc"]);

export class GameRoom extends Room<{ state: GameState }> {
  state = new GameState();
  maxClients = GAME.maxPlayers;
  private enemyId = 0;
  private projectileId = 0;
  private bossWaveSpawned = new Set<number>();
  private lastInputAt = new Map<string, number>();
  private eventIndex = 0;
  private started = false;

  onCreate(options?: { mapId?: string }) {
    this.autoDispose = true;
    this.state.roomCode = this.roomId;
    this.state.mapId = options?.mapId && options.mapId in MAPS ? options.mapId : "neon_city";
    this.state.mapName = MAPS[this.state.mapId as keyof typeof MAPS]?.name ?? "Neon City";

    this.onMessage("ready", (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "lobby") return;
      player.ready = Boolean(ready);
      const players = Array.from(this.state.players.values());
      if (players.length > 0 && players.every(p => p.ready)) this.startRun();
    });

    this.onMessage("chooseUpgrade", (client, id: string) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !id || player.upgradeChoices === "[]" || player.upgradeChoices === "pending") return;
      let choices: string[];
      try { choices = JSON.parse(player.upgradeChoices || "[]") as string[]; } catch { return; }
      if (!choices.includes(id) || !applyUpgrade(player, id)) return;
      player.pendingUpgradeLevels = Math.max(0, player.pendingUpgradeLevels - 1);
      player.upgradeChoices = player.pendingUpgradeLevels > 0 ? "pending" : "[]";
    });

    this.onMessage("weapon", (client, data: WeaponMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "lobby" || typeof data?.weapon !== "string") return;
      if (VALID_WEAPONS.has(data.weapon)) player.weapon = data.weapon;
    });

    this.onMessage("input", (client, message: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing" || player.downed || player.hp <= 0) return;
      const now = Date.now();
      const previous = this.lastInputAt.get(client.sessionId);
      const elapsedSeconds = previous === undefined ? 1 / GAME.serverHz : Math.max(0, Math.min(0.1, (now - previous) / 1000));
      if (elapsedSeconds < 1 / (GAME.serverHz * 2)) return;
      this.lastInputAt.set(client.sessionId, now);
      const rawDx = Number(message?.dx ?? 0);
      const rawDy = Number(message?.dy ?? 0);
      const dx = Number.isFinite(rawDx) ? Math.max(-1, Math.min(1, rawDx)) : 0;
      const dy = Number.isFinite(rawDy) ? Math.max(-1, Math.min(1, rawDy)) : 0;
      const length = Math.hypot(dx, dy) || 1;
      player.x = Math.max(40, Math.min(GAME.width - 40, player.x + (dx / length) * player.moveSpeed * elapsedSeconds));
      player.y = Math.max(40, Math.min(GAME.height - 40, player.y + (dy / length) * player.moveSpeed * elapsedSeconds));
    });

    this.onMessage("aim", (client, message: AimMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing" || player.downed || player.hp <= 0) return;
      const rawX = Number(message?.x);
      const rawY = Number(message?.y);
      const targetX = Number.isFinite(rawX) ? rawX : player.x + 1;
      const targetY = Number.isFinite(rawY) ? rawY : player.y;
      const dx = targetX - player.x;
      const dy = targetY - player.y;
      const length = Math.hypot(dx, dy) || 1;
      player.aimX = dx / length;
      player.aimY = dy / length;
    });

    this.onMessage("fire", client => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing" || player.downed || player.hp <= 0) return;
      fireProjectile(this.state, client.sessionId, () => `p_${this.projectileId++}`);
    });

    this.setSimulationInterval(deltaMs => this.tick(deltaMs), 1000 / GAME.serverHz);
  }

  onJoin(client: Client, options: JoinOptions) {
    if (this.state.phase !== "lobby") throw new Error("RUN_ALREADY_STARTED");
    const player = new PlayerState();
    player.name = typeof options?.name === "string" && options.name.trim() ? options.name.trim().slice(0, 18) : `Player ${this.clients.length}`;
    player.x = 300 + this.clients.length * 80;
    player.y = 540;
    player.hp = player.maxHp = GAME.startingHp;
    player.damage = GAME.startingDamage;
    player.attackCooldownMs = GAME.startingAttackCooldownMs;
    player.projectileSpeed = GAME.startingProjectileSpeed;
    player.pickupRadius = GAME.startingPickupRadius;
    player.lives = GAME.playerLives;
    if (typeof options?.mapId === "string" && options.mapId in MAPS) {
      this.state.mapId = options.mapId;
      this.state.mapName = MAPS[options.mapId as keyof typeof MAPS].name;
    }
    this.state.players.set(client.sessionId, player);
    this.lastInputAt.set(client.sessionId, Date.now());
  }

  onLeave(client: Client) {
    this.lastInputAt.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.players.size === 0) this.state.phase = "lobby";
  }

  private startRun() {
    if (this.started) return;
    this.started = true;
    this.state.phase = "playing";
    this.state.wave = 1;
    this.state.elapsedMs = 0;
    this.state.spawnTimerMs = 0;
    this.state.event = "";
    this.state.eventTimerMs = 0;
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
      let kind: EnemyKind = "basic";
      if (wave >= 7 && roll > 0.93) kind = "healer";
      else if (wave >= 6 && roll > 0.86) kind = "splitter";
      else if (wave >= 5 && roll > 0.77) kind = "swarm";
      else if (wave >= 8 && roll > 0.68) kind = "ranged";
      else if (wave >= 4 && roll > 0.58) kind = "tank";
      else if (wave >= 2 && roll > 0.44) kind = "fast";
      if (this.state.event === "blackout" && Math.random() > 0.6) kind = "elite";
      this.state.enemies.set(`e_${this.enemyId++}`, createEnemy(wave, kind, this.state.mapId));
    }

    if (wave >= WAVE.eliteEvery && wave % WAVE.eliteEvery === 0 && Math.floor(this.state.elapsedMs / WAVE.firstDurationMs) === wave - 1) {
      for (let i = 0; i < Math.min(1 + Math.floor(wave / 10), 3); i++) this.state.enemies.set(`e_${this.enemyId++}`, createEnemy(wave, "elite", this.state.mapId));
      if (wave % 10 === 5) this.state.enemies.set(`mini_${wave}`, createEnemy(wave, "miniboss", this.state.mapId));
    }

    if (wave >= WAVE.bossEvery && wave % WAVE.bossEvery === 0 && !this.bossWaveSpawned.has(wave)) {
      this.bossWaveSpawned.add(wave);
      this.state.enemies.set(`boss_${wave}`, createEnemy(wave, "boss", this.state.mapId));
    }
  }

  private maybeStartEvent(deltaMs: number) {
    if (this.state.wave < 3) return;
    this.state.eventTimerMs += deltaMs;
    if (this.state.event || this.state.eventTimerMs < GAME.eventIntervalMs) return;
    this.state.eventTimerMs = 0;
    const event = EVENTS[this.eventIndex % EVENTS.length];
    this.eventIndex += 1;
    this.state.event = event.id;
    this.state.eventTimerMs = event.durationMs;
  }

  private updateLeaderboard() {
    const board = Array.from(this.state.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(player => ({ name: player.name, score: Math.floor(player.score), kills: player.kills, level: player.level }));
    this.state.leaderboard = JSON.stringify(board);
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
    this.maybeStartEvent(deltaMs);
    this.spawnWaveContent();
    simulateCombat(this.state, deltaMs);
    this.updateLeaderboard();
  }
}
