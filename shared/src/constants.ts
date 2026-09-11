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
} as const;

export const WAVE = {
  firstDurationMs: 30_000,
  eliteEvery: 5,
  bossEvery: 10,
  baseSpawnIntervalMs: 900,
  minimumSpawnIntervalMs: 180,
  bossWarningMs: 4_000,
} as const;
