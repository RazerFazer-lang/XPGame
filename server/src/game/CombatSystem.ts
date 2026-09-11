import { GAME, MAPS } from "../../../shared/src/constants.js";
import { EnemyState, GameState, LootState, PlayerState, ProjectileState, XpDropState } from "../state/GameState.js";

export type EnemyKind = "basic" | "fast" | "tank" | "ranged" | "swarm" | "splitter" | "healer" | "elite" | "miniboss" | "boss";

export function createEnemy(wave: number, kind: EnemyKind = "basic", mapId = "neon_city"): EnemyState {
  const enemy = new EnemyState();
  const angle = Math.random() * Math.PI * 2;
  const radius = 640;
  enemy.x = GAME.width / 2 + Math.cos(angle) * radius;
  enemy.y = GAME.height / 2 + Math.sin(angle) * radius;
  const map = MAPS[mapId as keyof typeof MAPS] ?? MAPS.neon_city;
  const scale = (1 + Math.max(0, wave - 1) * 0.14) * map.enemyHp;
  enemy.kind = kind;
  enemy.elite = kind === "elite" || kind === "miniboss";
  enemy.boss = kind === "boss";
  const stats: Record<EnemyKind, { hp: number; speed: number; damage: number; xp: number; r: number }> = {
    basic: { hp: 30, speed: 70, damage: 8, xp: 10, r: 16 },
    fast: { hp: 20, speed: 135, damage: 7, xp: 12, r: 13 },
    tank: { hp: 120, speed: 42, damage: 15, xp: 24, r: 24 },
    ranged: { hp: 48, speed: 55, damage: 10, xp: 18, r: 17 },
    swarm: { hp: 14, speed: 165, damage: 5, xp: 8, r: 10 },
    splitter: { hp: 70, speed: 64, damage: 12, xp: 28, r: 19 },
    healer: { hp: 85, speed: 52, damage: 7, xp: 32, r: 19 },
    elite: { hp: 240, speed: 82, damage: 20, xp: 65, r: 25 },
    miniboss: { hp: 700, speed: 58, damage: 28, xp: 180, r: 34 },
    boss: { hp: 1800, speed: 48, damage: 32, xp: 450, r: 48 },
  };
  const base = stats[kind];
  const eliteScale = enemy.boss ? 1 + Math.max(0, wave - 1) * 0.18 : enemy.elite ? 1 + Math.max(0, wave - 1) * 0.16 : 1;
  enemy.maxHp = base.hp * scale * eliteScale;
  enemy.hp = enemy.maxHp;
  enemy.speed = base.speed + Math.min(80, wave * 2);
  enemy.damage = base.damage * (1 + Math.max(0, wave - 1) * 0.06);
  enemy.radius = base.r;
  enemy.xp = Math.round(base.xp * (1 + Math.max(0, wave - 1) * 0.03));
  enemy.phase = 1;
  return enemy;
}

export function moveEnemyTowardPlayer(enemy: EnemyState, player: PlayerState, deltaSeconds: number): void {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (enemy.kind === "ranged" && distance < 280) {
    enemy.x -= (dx / distance) * enemy.speed * deltaSeconds;
    enemy.y -= (dy / distance) * enemy.speed * deltaSeconds;
    return;
  }
  if (enemy.kind === "healer" && distance < 220) return;
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

export function addLoot(state: GameState, id: string, x: number, y: number, kind = "coin", value = 1, rarity = "common"): void {
  const drop = new LootState();
  drop.x = x; drop.y = y; drop.kind = kind; drop.value = value; drop.rarity = rarity;
  state.loot.set(id, drop);
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

const WEAPONS: Record<string, { cooldown: number; count: number; spread: number; speed: number; multiplier: number }> = {
  rifle: { cooldown: 350, count: 1, spread: 0, speed: 760, multiplier: 1 },
  shotgun: { cooldown: 650, count: 5, spread: 0.48, speed: 660, multiplier: 0.58 },
  smg: { cooldown: 150, count: 1, spread: 0.03, speed: 820, multiplier: 0.62 },
  cannon: { cooldown: 900, count: 1, spread: 0, speed: 520, multiplier: 2.8 },
  arc: { cooldown: 450, count: 3, spread: 0.34, speed: 880, multiplier: 0.82 },
};

export function fireProjectile(state: GameState, playerId: string, nextId: () => string): boolean {
  const player = state.players.get(playerId);
  if (!player || state.phase !== "playing" || player.downed || player.hp <= 0 || player.attackTimerMs > 0) return false;
  const weapon = WEAPONS[player.weapon] ?? WEAPONS.rifle;
  const levelScale = 1 + Math.max(0, player.weaponLevel - 1) * 0.12;
  const count = Math.max(1, Math.min(12, Math.floor(Math.max(player.projectileCount, weapon.count))));
  const totalSpread = count === 1 ? weapon.spread : Math.min(1.2, Math.max(player.spread, weapon.spread));
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = Math.atan2(player.aimY, player.aimX) + t * totalSpread;
    const projectile = new ProjectileState();
    projectile.ownerId = playerId;
    projectile.x = player.x + Math.cos(angle) * 24;
    projectile.y = player.y + Math.sin(angle) * 24;
    projectile.vx = Math.cos(angle) * (player.projectileSpeed || weapon.speed);
    projectile.vy = Math.sin(angle) * (player.projectileSpeed || weapon.speed);
    projectile.damage = player.damage * weapon.multiplier * levelScale * (Math.random() < player.critChance ? player.critMultiplier : 1);
    projectile.pierce = Math.max(0, Math.floor(player.pierce));
    state.projectiles.set(nextId(), projectile);
  }
  player.attackTimerMs = Math.max(70, Math.min(1600, Math.min(player.attackCooldownMs, weapon.cooldown)));
  return true;
}
