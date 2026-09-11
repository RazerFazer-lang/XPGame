export const GAME = {
  width: 1920,
  height: 1080,
  serverHz: 30,
  maxPlayers: 4,
  startingHp: 100,
  playerSpeed: 260,
  startingDamage: 12,
  startingAttackCooldownMs: 350,
  startingProjectileSpeed: 760,
  startingPickupRadius: 95,
  xpPerBasicEnemy: 10,
  downedRespawnMs: 7000,
  playerLives: 3,
  reviveRange: 90,
  reviveMs: 2500,
  eventIntervalMs: 45000,
} as const;

export const WAVE = {
  firstDurationMs: 30_000,
  eliteEvery: 5,
  bossEvery: 10,
  baseSpawnIntervalMs: 900,
  minimumSpawnIntervalMs: 150,
  bossWarningMs: 4_000,
} as const;

export const MAPS = {
  neon_city: { name: "Neon City", speed: 1, enemyHp: 1, accent: "cyan" },
  desert_ruins: { name: "Desert Ruins", speed: 1.08, enemyHp: 1.05, accent: "amber" },
  frozen_outpost: { name: "Frozen Outpost", speed: 0.92, enemyHp: 1.1, accent: "ice" },
  toxic_swamp: { name: "Toxic Swamp", speed: 1.02, enemyHp: 1.15, accent: "acid" },
} as const;

export const EVENTS = [
  { id: "blood_moon", name: "BLOOD MOON", durationMs: 18000, effect: "enemy_rage" },
  { id: "supply_drop", name: "SUPPLY DROP", durationMs: 14000, effect: "loot_rain" },
  { id: "overdrive", name: "OVERDRIVE", durationMs: 16000, effect: "player_haste" },
  { id: "blackout", name: "BLACKOUT", durationMs: 12000, effect: "elite_hunt" },
] as const;
