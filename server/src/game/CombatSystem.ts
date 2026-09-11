import { GAME } from "../../../shared/src/constants.js";
import { EnemyState, GameState, PlayerState, ProjectileState, XpDropState } from "../state/GameState.js";

export function createEnemy(wave: number, kind: "basic" | "fast" | "tank" | "ranged" | "elite" | "boss" = "basic"): EnemyState {
  const enemy = new EnemyState();
  const angle = Math.random() * Math.PI * 2;
  const radius = 640;
  enemy.x = GAME.width / 2 + Math.cos(angle) * radius;
  enemy.y = GAME.height / 2 + Math.sin(angle) * radius;
  const scale = 1 + Math.max(0, wave - 1) * 0.14;
  enemy.kind = kind;
  enemy.elite = kind === "elite";
  enemy.boss = kind === "boss";
  const stats = {
    basic: { hp: 30, speed: 70, damage: 8, xp: 10, r: 16 },
    fast: { hp: 20, speed: 125, damage: 7, xp: 12, r: 13 },
    tank: { hp: 110, speed: 42, damage: 15, xp: 24, r: 24 },
    ranged: { hp: 42, speed: 55, damage: 10, xp: 18, r: 17 },
    elite: { hp: 220, speed: 82, damage: 20, xp: 65, r: 24 },
    boss: { hp: 1600, speed: 48, damage: 32, xp: 400, r: 48 },
  }[kind];
  const eliteScale = enemy.boss ? 1 + Math.max(0, wave - 1) * 0.18 : enemy.elite ? 1 + Math.max(0, wave - 1) * 0.16 : 1;
  enemy.maxHp = stats.hp * scale * eliteScale;
  enemy.hp = enemy.maxHp;
  enemy.speed = stats.speed + Math.min(75, wave * 2);
  enemy.damage = stats.damage * (1 + Math.max(0, wave - 1) * 0.06);
  enemy.radius = stats.r;
  enemy.xp = Math.round(stats.xp * (1 + Math.max(0, wave - 1) * 0.03));
  return enemy;
}

export function moveEnemyTowardPlayer(enemy: EnemyState, player: PlayerState, deltaSeconds: number): void {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (enemy.kind === "ranged" && distance < 260) {
    enemy.x -= (dx / distance) * enemy.speed * deltaSeconds;
    enemy.y -= (dy / distance) * enemy.speed * deltaSeconds;
    return;
  }
  if (distance > enemy.radius + 20) {
    enemy.x += (dx / distance) * enemy.speed * deltaSeconds;
    enemy.y += (dy / distance) * enemy.speed * deltaSeconds;
  }
}

export function addXpDrop(state: GameState, id: string, x: number, y: number, value: number): void {
  const drop = new XpDropState();
  drop.x = x; drop.y = y; drop.value = value;
  state.xpDrops.set(id, drop);
}

export function addPlayerXp(player: PlayerState, amount: number): boolean {
  let leveled = false;
  player.xp += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(player.xpToNext * 1.22 + 18);
    leveled = true;
  }
  return leveled;
}

export function fireProjectile(state: GameState, playerId: string, nextId: () => string): boolean {
  const player = state.players.get(playerId);
  if (!player || state.phase !== "playing" || player.hp <= 0 || player.attackTimerMs > 0) return false;
  const count = Math.max(1, Math.min(8, Math.floor(player.projectileCount)));
  const totalSpread = count === 1 ? 0 : Math.min(1.0, player.spread || 0.16);
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = Math.atan2(player.aimY, player.aimX) + t * totalSpread;
    const projectile = new ProjectileState();
    projectile.ownerId = playerId;
    projectile.x = player.x + Math.cos(angle) * 24;
    projectile.y = player.y + Math.sin(angle) * 24;
    projectile.vx = Math.cos(angle) * player.projectileSpeed;
    projectile.vy = Math.sin(angle) * player.projectileSpeed;
    projectile.damage = player.damage * (Math.random() < player.critChance ? player.critMultiplier : 1);
    projectile.pierce = Math.max(0, Math.floor(player.pierce));
    state.projectiles.set(nextId(), projectile);
  }
  player.attackTimerMs = player.attackCooldownMs;
  return true;
}
