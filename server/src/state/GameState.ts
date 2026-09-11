import { MapSchema, Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type("string") name = "Player";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("number") xpToNext = 100;
  @type("number") kills = 0;
  @type("boolean") ready = false;
  @type("number") aimX = 1;
  @type("number") aimY = 0;
  @type("number") attackCooldownMs = 350;
  @type("number") attackTimerMs = 0;
  @type("number") damage = 12;
  @type("number") moveSpeed = 260;
  @type("number") projectileSpeed = 760;
  @type("number") projectileCount = 1;
  @type("number") spread = 0;
  @type("number") pierce = 0;
  @type("number") pickupRadius = 95;
  @type("number") armor = 0;
  @type("number") critChance = 0.05;
  @type("number") critMultiplier = 1.75;
  @type("string") upgradeChoices = "[]";
  @type("string") upgrades = "[]";
  @type("number") pendingUpgradeLevels = 0;
}

export class EnemyState extends Schema {
  @type("string") kind = "basic";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 30;
  @type("number") maxHp = 30;
  @type("number") speed = 70;
  @type("number") radius = 16;
  @type("number") xp = 10;
  @type("number") damage = 8;
  @type("boolean") elite = false;
  @type("boolean") boss = false;
}

export class ProjectileState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") damage = 12;
  @type("number") lifeMs = 900;
  @type("string") ownerId = "";
  @type("number") pierce = 0;
  @type("number") hits = 0;
}

export class XpDropState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") value = 10;
  @type("number") lifeMs = 30000;
}

export class GameState extends Schema {
  @type("string") phase = "lobby";
  @type("number") wave = 0;
  @type("number") elapsedMs = 0;
  @type("number") spawnTimerMs = 0;
  @type("number") enemiesDefeated = 0;
  @type("number") bossesDefeated = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type({ map: XpDropState }) xpDrops = new MapSchema<XpDropState>();
}
