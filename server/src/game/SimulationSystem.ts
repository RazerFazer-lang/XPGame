import { GameState, PlayerState } from "../state/GameState.js";
import { addPlayerXp, addXpDrop, moveEnemyTowardPlayer } from "./CombatSystem.js";

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

export function simulateCombat(state: GameState, deltaMs: number): void {
  const dt = deltaMs / 1000;

  for (const [id, enemy] of state.enemies) {
    const target = nearestLivingPlayer(state, enemy.x, enemy.y);
    if (!target) continue;
    moveEnemyTowardPlayer(enemy, target, dt);
    const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
    if (distance <= enemy.radius + 20) {
      const raw = enemy.damage * dt;
      target.hp = Math.max(0, target.hp - Math.max(1, raw - target.armor * 0.15 * dt));
    }
    if (enemy.x < -200 || enemy.x > 2120 || enemy.y < -200 || enemy.y > 1280) state.enemies.delete(id);
  }

  for (const [projectileId, projectile] of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.lifeMs -= deltaMs;
    let remove = projectile.lifeMs <= 0;

    for (const [enemyId, enemy] of state.enemies) {
      if ((enemy.x - projectile.x) ** 2 + (enemy.y - projectile.y) ** 2 > (enemy.radius + 8) ** 2) continue;
      enemy.hp -= projectile.damage;
      projectile.hits += 1;
      if (enemy.hp <= 0) {
        const owner = state.players.get(projectile.ownerId);
        if (owner) {
          owner.kills += 1;
          state.enemiesDefeated += 1;
          addXpDrop(state, `xp_${state.enemiesDefeated}_${projectile.ownerId}`, enemy.x, enemy.y, enemy.xp);
        }
        state.enemies.delete(enemyId);
      }
      if (projectile.hits > projectile.pierce) { remove = true; break; }
    }

    if (remove || projectile.x < -100 || projectile.x > 2020 || projectile.y < -100 || projectile.y > 1180) state.projectiles.delete(projectileId);
  }

  for (const [id, drop] of state.xpDrops) {
    drop.lifeMs -= deltaMs;
    let collected = false;
    for (const player of state.players.values()) {
      if (player.hp <= 0) continue;
      const distance = Math.hypot(player.x - drop.x, player.y - drop.y);
      if (distance <= player.pickupRadius) {
        const leveled = addPlayerXp(player, drop.value);
        if (leveled) player.upgradeChoices = "pending";
        collected = true;
        break;
      }
    }
    if (collected || drop.lifeMs <= 0) state.xpDrops.delete(id);
  }

  const living = Array.from(state.players.values()).some(p => p.hp > 0);
  if (!living && state.players.size > 0) state.phase = "game_over";
}
