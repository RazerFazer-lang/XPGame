import { GameState, PlayerState } from "../state/GameState.js";
import { addPlayerXp, addLoot, addXpDrop, moveEnemyTowardPlayer } from "./CombatSystem.js";

const CELL_SIZE = 120;

function nearestLivingPlayer(state: GameState, x: number, y: number): PlayerState | undefined {
  let target: PlayerState | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const player of state.players.values()) {
    if (player.downed || player.hp <= 0) continue;
    const distance = (player.x - x) ** 2 + (player.y - y) ** 2;
    if (distance < best) { best = distance; target = player; }
  }
  return target;
}

function cellKey(x: number, y: number): string { return `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}`; }

function applyDownedState(state: GameState, player: PlayerState, damage: number): void {
  if (player.downed || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - damage);
  if (player.hp > 0) return;
  player.downed = true;
  player.respawnMs = GAME_RESPAWN_MS;
  player.lives = Math.max(0, player.lives - 1);
}

const GAME_RESPAWN_MS = 7000;

function updatePlayers(state: GameState, deltaMs: number): void {
  for (const player of state.players.values()) {
    if (!player.downed) continue;
    player.respawnMs = Math.max(0, player.respawnMs - deltaMs);
    if (player.respawnMs <= 0 && player.lives > 0) {
      player.downed = false;
      player.hp = player.maxHp;
      player.x = 960;
      player.y = 540;
    }
  }

  for (const reviver of state.players.values()) {
    if (reviver.downed || reviver.hp <= 0) continue;
    for (const target of state.players.values()) {
      if (target === reviver || !target.downed || target.lives <= 0) continue;
      if (Math.hypot(reviver.x - target.x, reviver.y - target.y) <= 90) {
        target.respawnMs = Math.max(0, target.respawnMs - deltaMs);
        if (target.respawnMs <= 0) {
          target.downed = false;
          target.hp = Math.ceil(target.maxHp * 0.45);
          target.revives += 1;
          reviver.score += 100;
        }
      }
    }
  }
}

function spawnEventLoot(state: GameState): void {
  if (!state.event) return;
  for (let i = 0; i < 2; i += 1) {
    const x = 180 + Math.random() * (1920 - 360);
    const y = 160 + Math.random() * (1080 - 320);
    addLoot(state, `loot_${Date.now()}_${i}`, x, y, "coin", 25, "rare");
  }
}

export function simulateCombat(state: GameState, deltaMs: number): void {
  const dt = deltaMs / 1000;
  updatePlayers(state, deltaMs);
  const grid = new Map<string, string[]>();

  for (const [id, enemy] of state.enemies) {
    if (enemy.boss && enemy.hp / enemy.maxHp < 0.66 && enemy.phase < 2) enemy.phase = 2;
    if (enemy.boss && enemy.hp / enemy.maxHp < 0.33 && enemy.phase < 3) enemy.phase = 3;
    const target = nearestLivingPlayer(state, enemy.x, enemy.y);
    if (target) {
      moveEnemyTowardPlayer(enemy, target, dt);
      const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
      const attackRange = enemy.kind === "ranged" || enemy.kind === "healer" ? 280 : enemy.radius + 20;
      if (distance <= attackRange) {
        const rageMultiplier = enemy.boss && enemy.phase === 3 ? 1.65 : enemy.elite ? 1.15 : 1;
        const mitigation = Math.min(enemy.damage, target.armor);
        applyDownedState(state, target, Math.max(0, enemy.damage * rageMultiplier - mitigation) * dt);
      }
      if (enemy.kind === "healer") {
        for (const ally of state.enemies.values()) {
          if (ally === enemy || ally.hp <= 0 || Math.hypot(ally.x - enemy.x, ally.y - enemy.y) > 180) continue;
          ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.06 * dt);
        }
      }
    }
    if (enemy.x < -200 || enemy.x > 2120 || enemy.y < -200 || enemy.y > 1280) { state.enemies.delete(id); continue; }
    const key = cellKey(enemy.x, enemy.y);
    const bucket = grid.get(key);
    if (bucket) bucket.push(id); else grid.set(key, [id]);
  }

  for (const [projectileId, projectile] of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.lifeMs -= deltaMs;
    let remove = projectile.lifeMs <= 0;
    const cx = Math.floor(projectile.x / CELL_SIZE);
    const cy = Math.floor(projectile.y / CELL_SIZE);
    search: for (let gx = cx - 1; gx <= cx + 1; gx += 1) for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
      const ids = grid.get(`${gx}:${gy}`) ?? [];
      for (const enemyId of ids) {
        const enemy = state.enemies.get(enemyId); if (!enemy) continue;
        if ((enemy.x - projectile.x) ** 2 + (enemy.y - projectile.y) ** 2 > (enemy.radius + 8) ** 2) continue;
        enemy.hp -= projectile.damage;
        projectile.hits += 1;
        if (enemy.hp <= 0) {
          const owner = state.players.get(projectile.ownerId);
          if (owner) {
            owner.kills += 1;
            owner.score += enemy.boss ? 5000 : enemy.elite ? 650 : 100;
            state.enemiesDefeated += 1;
            addXpDrop(state, `xp_${state.enemiesDefeated}`, enemy.x, enemy.y, enemy.xp);
            if (Math.random() < (enemy.boss ? 1 : enemy.elite ? 0.65 : 0.18)) addLoot(state, `loot_${state.enemiesDefeated}`, enemy.x, enemy.y, Math.random() < 0.35 ? "weapon" : "coin", enemy.boss ? 250 : enemy.elite ? 75 : 25, enemy.boss ? "legendary" : enemy.elite ? "epic" : "common");
          }
          if (enemy.boss) state.bossesDefeated += 1;
          state.enemies.delete(enemyId);
        }
        if (projectile.hits > projectile.pierce) { remove = true; break search; }
      }
    }
    if (remove || projectile.x < -100 || projectile.x > 2020 || projectile.y < -100 || projectile.y > 1180) state.projectiles.delete(projectileId);
  }

  for (const [id, drop] of state.xpDrops) {
    drop.lifeMs -= deltaMs;
    let collected = false;
    for (const player of state.players.values()) {
      if (player.downed || player.hp <= 0) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) <= player.pickupRadius) {
        const previousLevel = player.level;
        if (addPlayerXp(player, drop.value)) {
          player.pendingUpgradeLevels += player.level - previousLevel;
          if (player.upgradeChoices === "[]") player.upgradeChoices = "pending";
        }
        player.score += drop.value;
        collected = true;
        break;
      }
    }
    if (collected || drop.lifeMs <= 0) state.xpDrops.delete(id);
  }

  for (const [id, loot] of state.loot) {
    loot.lifeMs -= deltaMs;
    let collected = false;
    for (const player of state.players.values()) {
      if (player.downed || player.hp <= 0) continue;
      if (Math.hypot(player.x - loot.x, player.y - loot.y) <= player.pickupRadius) {
        if (loot.kind === "coin") player.coins += loot.value;
        if (loot.kind === "weapon") player.weaponLevel = Math.min(10, player.weaponLevel + 1);
        player.score += loot.value * (loot.kind === "weapon" ? 10 : 1);
        collected = true;
        break;
      }
    }
    if (collected || loot.lifeMs <= 0) state.loot.delete(id);
  }

  state.eventTimerMs = Math.max(0, state.eventTimerMs - deltaMs);
  if (state.event && state.eventTimerMs <= 0) state.event = "";

  const activePlayers = Array.from(state.players.values());
  const living = activePlayers.some(p => !p.downed && p.hp > 0);
  const canStillRevive = activePlayers.some(p => p.downed && p.lives > 0 && p.respawnMs > 0);
  if (!living && !canStillRevive && activePlayers.length > 0) state.phase = "game_over";
  if (state.wave >= 20 && state.bossesDefeated > 0 && !Array.from(state.enemies.values()).some(e => e.boss) && state.phase === "playing") state.phase = "victory";
}
