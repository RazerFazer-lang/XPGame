import { GAME } from "../../../shared/src/constants.js";
import { EnemyState, GameState, PlayerState, ProjectileState } from "../state/GameState.js";

export function addPlayerXp(player: PlayerState, amount: number): void {
  player.xp += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(player.xpToNext * 1.22 + 18);
  }
}

export function createEnemy(wave: number): EnemyState {
  const enemy = new EnemyState();
  enemy.x = Math.random() * GAME.width;
  enemy.y = Math.random() * GAME.height;
  const scaling = 1 + Math.max(0, wave - 1) * 0.14;
  enemy.maxHp = 30 * scaling;
  enemy.hp = enemy.maxHp;
  enemy.speed = 70 + Math.min(80, wave * 3);
  enemy.xp = Math.round(GAME.xpPerBasicEnemy * (1 + Math.max(0, wave - 1) * 0.04));
  return enemy;
}

export function moveEnemyTowardPlayer(enemy: EnemyState, player: PlayerState, deltaSeconds: number): void {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance <= enemy.radius + 18) return;
  enemy.x += (dx / distance) * enemy.speed * deltaSeconds;
  enemy.y += (dy / distance) * enemy.speed * deltaSeconds;
}

export function fireProjectile(state: GameState, playerId: string, nextId: () => string): boolean {
  const player = state.players.get(playerId);
  if (!player || state.phase !== "playing" || player.hp <= 0 || player.attackTimerMs > 0) return false;
  const projectile = new ProjectileState();
  projectile.ownerId = playerId;
  projectile.x = player.x + player.aimX * 22;
  projectile.y = player.y + player.aimY * 22;
  projectile.vx = player.aimX * 760;
  projectile.vy = player.aimY * 760;
  state.projectiles.set(nextId(), projectile);
  player.attackTimerMs = player.attackCooldownMs;
  return true;
}
