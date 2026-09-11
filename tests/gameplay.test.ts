import test from "node:test";
import assert from "node:assert/strict";
import { PlayerState, EnemyState, GameState } from "../server/src/state/GameState.js";
import { addPlayerXp, fireProjectile } from "../server/src/game/CombatSystem.js";
import { applyUpgrade, getUpgradeChoices } from "../server/src/game/UpgradeSystem.js";
import { simulateCombat } from "../server/src/game/SimulationSystem.js";

test("XP levels a player and increases the next threshold", () => {
  const player = new PlayerState();
  player.xpToNext = 100;
  const leveled = addPlayerXp(player, 125);
  assert.equal(leveled, true);
  assert.equal(player.level, 2);
  assert.equal(player.xp, 25);
  assert.ok(player.xpToNext > 100);
});

test("XP supports multiple levels from one large pickup", () => {
  const player = new PlayerState();
  player.xpToNext = 100;
  const leveled = addPlayerXp(player, 500);
  assert.equal(leveled, true);
  assert.ok(player.level >= 3);
  assert.ok(player.xp >= 0);
  assert.ok(player.xp < player.xpToNext);
});

test("upgrade choices are unique", () => {
  const player = new PlayerState();
  const choices = getUpgradeChoices(player, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, choices.length);
});

test("upgrades can stack and are applied server-side", () => {
  const player = new PlayerState();
  const before = player.damage;
  assert.equal(applyUpgrade(player, "heavy_bullets"), true);
  const afterFirst = player.damage;
  assert.ok(afterFirst > before);
  assert.equal(applyUpgrade(player, "heavy_bullets"), true);
  assert.ok(player.damage > afterFirst);
});

test("armor mitigates incoming melee damage without reversing it", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.hp = 100; player.armor = 5; player.x = 100; player.y = 100;
  state.players.set("p1", player);
  const enemy = new EnemyState();
  enemy.kind = "basic"; enemy.damage = 10; enemy.speed = 0; enemy.radius = 16; enemy.x = 100; enemy.y = 100;
  state.enemies.set("e1", enemy); state.phase = "playing"; state.wave = 1;
  simulateCombat(state, 1000);
  assert.equal(player.hp, 95);
});

test("ranged enemies can damage players from distance", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.hp = 100; player.x = 300; player.y = 300;
  state.players.set("p1", player);
  const enemy = new EnemyState();
  enemy.kind = "ranged"; enemy.damage = 10; enemy.speed = 0; enemy.radius = 17; enemy.x = 520; enemy.y = 300;
  state.enemies.set("e1", enemy); state.phase = "playing"; state.wave = 1;
  simulateCombat(state, 1000);
  assert.equal(player.hp, 90);
});

test("player enters downed state instead of immediate game over", () => {
  const state = new GameState();
  const player = new PlayerState(); player.hp = 20; player.x = 100; player.y = 100; player.lives = 2;
  state.players.set("p1", player);
  const enemy = new EnemyState(); enemy.damage = 1000; enemy.speed = 0; enemy.x = 100; enemy.y = 100;
  state.enemies.set("e1", enemy); state.phase = "playing"; state.wave = 1;
  simulateCombat(state, 1000);
  assert.equal(player.downed, true);
  assert.equal(player.lives, 1);
  assert.notEqual(state.phase, "game_over");
});

test("downed player can respawn after the grace period", () => {
  const state = new GameState();
  const player = new PlayerState(); player.hp = 1; player.x = 100; player.y = 100; player.lives = 2;
  state.players.set("p1", player);
  const enemy = new EnemyState(); enemy.damage = 1000; enemy.speed = 0; enemy.x = 100; enemy.y = 100;
  state.enemies.set("e1", enemy); state.phase = "playing"; state.wave = 1;
  simulateCombat(state, 1000);
  assert.equal(player.downed, true);
  simulateCombat(state, 7000);
  assert.equal(player.downed, false);
  assert.equal(player.hp, player.maxHp);
});

test("revive nearby downed player", () => {
  const state = new GameState();
  const rescuer = new PlayerState(); rescuer.x = 200; rescuer.y = 200; rescuer.hp = 100;
  const target = new PlayerState(); target.x = 210; target.y = 200; target.hp = 0; target.downed = true; target.lives = 1; target.respawnMs = 1000;
  state.players.set("rescuer", rescuer); state.players.set("target", target); state.phase = "playing"; state.wave = 1;
  simulateCombat(state, 1000);
  assert.equal(target.downed, false);
  assert.ok(target.hp > 0);
  assert.equal(rescuer.revives, 1);
});

test("weapon families change projectile cadence and count", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.weapon = "shotgun"; player.attackTimerMs = 0; player.aimX = 1; player.aimY = 0; player.x = 200; player.y = 200;
  state.players.set("p1", player); state.phase = "playing";
  assert.equal(fireProjectile(state, "p1", () => `p_${state.projectiles.size}`), true);
  assert.ok(state.projectiles.size >= 5);
  assert.ok(player.attackTimerMs > 0);
});
