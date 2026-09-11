export const GAME = {
  width: 1920,
  height: 1080,
  serverHz: 30,
  maxPlayers: 4,
  startingHp: 100,
  playerSpeed: 260,
  startingDamage: 12,
  startingAttackCooldownMs: 350,
  xpPerBasicEnemy: 10,
} as const;

export const WAVE = {
  firstDurationMs: 30_000,
  baseEnemies: 15,
  growthPerWave: 6,
  eliteEvery: 5,
  bossEvery: 10,
} as const;
