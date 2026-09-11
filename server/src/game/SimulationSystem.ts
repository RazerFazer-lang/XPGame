import { GameState } from "../state/GameState.js";
import { addPlayerXp, moveEnemyTowardPlayer } from "./CombatSystem.js";

export function simulateCombat(state: GameState, deltaMs: number): void {
  const dt = deltaMs / 1000;

  for (const [id, enemy] of state.enemies) {
    let target = undefined as ReturnType<typeof state.players.get>;
    let best = Number.POSITIVE_INFINITY;
    for (const player of state.players.values()) {
      if (player.hp <= 0) continue;
      const distance = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
      if (distance < best) { best = distance; target = player; }
    }
    if (!target) continue;
    moveEnemyTowardPlayer(enemy, target, dt);
    if (Math.hypot(target.x - enemy.x, target.y - enemy.y) <= enemy.radius + 18) {
      target.hp = Math.max(0, target.hp - (8 + state.wave * 0.5) * dt);
    }
    if (enemy.x < -160 || enemy.x > 2080 || enemy.y < -160 || enemy.y > 1240) state.enemies.delete(id);
  }

  for (const [projectileId, projectile] of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.lifeMs -= deltaMs;
    let remove = projectile.lifeMs <= 0;

    for (const [enemyId, enemy] of state.enemies) {
      if (Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) > enemy.radius + 7) continue;
      enemy.hp -= projectile.damage;
      remove = true;
      if (enemy.hp <= 0) {
        const owner = state.players.get(projectile.ownerId);
        if (owner) { owner.kills += 1; addPlayerXp(owner, enemy.xp); }
        state.enemies.delete(enemyId);
      }
      break;
    }
    if (remove || projectile.x < -100 || projectile.x > 2020 || projectile.y < -100 || projectile.y > 1180) state.projectiles.delete(projectileId);
  }
}
