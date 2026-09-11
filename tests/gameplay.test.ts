import test from "node:test";
import assert from "node:assert/strict";
import { PlayerState } from "../server/src/state/GameState.js";
import { addPlayerXp } from "../server/src/game/CombatSystem.js";
import { applyUpgrade, getUpgradeChoices } from "../server/src/game/UpgradeSystem.js";

test("XP levels a player and increases the next threshold", () => {
  const player = new PlayerState();
  player.xpToNext = 100;

  const leveled = addPlayerXp(player, 125);

  assert.equal(leveled, true);
  assert.equal(player.level, 2);
  assert.equal(player.xp, 25);
  assert.ok(player.xpToNext > 100);
});

test("upgrade choices are unique", () => {
  const player = new PlayerState();
  const choices = getUpgradeChoices(player, 3);
  assert.equal(new Set(choices.map((choice) => choice.id)).size, choices.length);
});

test("upgrade application is server-side and non-repeatable", () => {
  const player = new PlayerState();
  const before = player.damage;

  assert.equal(applyUpgrade(player, "heavy_bullets"), true);
  assert.ok(player.damage > before);
  assert.equal(applyUpgrade(player, "heavy_bullets"), false);
});
