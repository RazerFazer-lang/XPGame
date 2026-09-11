import { GameState, PlayerState } from "../state/GameState.js";
import { addPlayerXp, addXpDrop, moveEnemyTowardPlayer } from "./CombatSystem.js";

const CELL_SIZE = 120;

function nearestLivingPlayer(state: GameState, x: number, y: number): PlayerState | undefined {
  let target: PlayerState | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const player of state.players.values()) {
    if (player.hp <= 0) continue;
    const distance = (player.x - x) ** 2 + (player.y - y) ** 2;
    if (distance < best) { best = distance; target = player; }
  }
  return target;
}

function cellKey(x: number, y: number): string { return `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}`; }

export function simulateCombat(state: GameState, deltaMs: number): void {
  const dt = deltaMs / 1000;
  const grid = new Map<string, string[]>();

  for (const [id, enemy] of state.enemies) {
    const target = nearestLivingPlayer(state, enemy.x, enemy.y);
    if (target) {
      moveEnemyTowardPlayer(enemy, target, dt);
      const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
      if (distance <= enemy.radius + 20) {
        const raw = enemy.damage * dt;
        target.hp = Math.max(0, target.hp - Math.max(1, raw - target.armor * 0.15 * dt));
      }
    }
    if (enemy.x < -200 || enemy.x > 2120 || enemy.y < -200 || enemy.y > 1280) { state.enemies.delete(id); continue; }
    const key = cellKey(enemy.x, enemy.y);
    const bucket = grid.get(key);
    if (bucket) bucket.push(id); else grid.set(key, [id]);
  }

  for (const [projectileId, projectile] of state.projectiles) {
    projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.lifeMs -= deltaMs;
    let remove = projectile.lifeMs <= 0;
    const cx = Math.floor(projectile.x / CELL_SIZE); const cy = Math.floor(projectile.y / CELL_SIZE);
    search: for (let gx = cx - 1; gx <= cx + 1; gx += 1) for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
      const ids = grid.get(`${gx}:${gy}`) ?? [];
      for (const enemyId of ids) {
        const enemy = state.enemies.get(enemyId); if (!enemy) continue;
        if ((enemy.x - projectile.x) ** 2 + (enemy.y - projectile.y) ** 2 > (enemy.radius + 8) ** 2) continue;
        enemy.hp -= projectile.damage; projectile.hits += 1;
        if (enemy.hp <= 0) {
          const owner = state.players.get(projectile.ownerId);
          if (owner) { owner.kills += 1; state.enemiesDefeated += 1; addXpDrop(state, `xp_${state.enemiesDefeated}`, enemy.x, enemy.y, enemy.xp); }
          if (enemy.boss) state.bossesDefeated += 1;
          state.enemies.delete(enemyId);
        }
        if (projectile.hits > projectile.pierce) { remove = true; break search; }
      }
    }
    if (remove || projectile.x < -100 || projectile.x > 2020 || projectile.y < -100 || projectile.y > 1180) state.projectiles.delete(projectileId);
  }

  for (const [id, drop] of state.xpDrops) {
    drop.lifeMs -= deltaMs; let collected = false;
    for (const player of state.players.values()) {
      if (player.hp <= 0) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) <= player.pickupRadius) {
        if (addPlayerXp(player, drop.value)) player.upgradeChoices = "pending";
        collected = true; break;
      }
    }
    if (collected || drop.lifeMs <= 0) state.xpDrops.delete(id);
  }

  const living = Array.from(state.players.values()).some(p => p.hp > 0);
  if (!living && state.players.size > 0) state.phase = "game_over";
  if (state.wave >= 20 && state.bossesDefeated > 0 && !Array.from(state.enemies.values()).some(e => e.boss) && state.phase === "playing") state.phase = "victory";
}
