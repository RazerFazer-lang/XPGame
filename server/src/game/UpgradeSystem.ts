import { PlayerState } from "../state/GameState.js";

export interface UpgradeDefinition {
  id: string;
  title: string;
  description: string;
  rarity: string;
  apply: (player: PlayerState) => void;
}

export const UPGRADES: UpgradeDefinition[] = [
  { id: "heavy_bullets", title: "Heavy Bullets", description: "+20% damage", rarity: "Common", apply: p => { p.damage *= 1.2; } },
  { id: "rapid_fire", title: "Rapid Fire", description: "12% faster attacks", rarity: "Common", apply: p => { p.attackCooldownMs *= 0.88; } },
  { id: "twin_shot", title: "Twin Shot", description: "+1 projectile", rarity: "Uncommon", apply: p => { p.projectileCount += 1; p.spread = Math.max(p.spread, 0.12); } },
  { id: "piercing", title: "Piercing", description: "+1 pierce", rarity: "Uncommon", apply: p => { p.pierce += 1; } },
  { id: "velocity", title: "Velocity", description: "+20% projectile speed", rarity: "Common", apply: p => { p.projectileSpeed *= 1.2; } },
  { id: "adrenaline", title: "Adrenaline", description: "+15% movement speed", rarity: "Common", apply: p => { p.moveSpeed *= 1.15; } },
  { id: "magnet", title: "Magnet", description: "+45 pickup radius", rarity: "Common", apply: p => { p.pickupRadius += 45; } },
  { id: "vitality", title: "Vitality", description: "+25 max HP and heal", rarity: "Common", apply: p => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: "armor", title: "Armor Plating", description: "Reduce incoming damage", rarity: "Uncommon", apply: p => { p.armor += 2; } },
  { id: "critical", title: "Critical Strike", description: "+8% crit chance", rarity: "Rare", apply: p => { p.critChance = Math.min(0.75, p.critChance + 0.08); } },
  { id: "deadeye", title: "Deadeye", description: "+35% critical damage", rarity: "Rare", apply: p => { p.critMultiplier += 0.35; } },
  { id: "overclock", title: "Overclock", description: "18% faster attacks and +8% damage", rarity: "Epic", apply: p => { p.attackCooldownMs *= 0.82; p.damage *= 1.08; } },
];

function readOwned(player: PlayerState): string[] {
  try {
    const parsed = JSON.parse(player.upgrades || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function getUpgradeChoices(_player: PlayerState, count = 3): UpgradeDefinition[] {
  const safeCount = Math.max(1, Math.min(5, Math.floor(count)));
  return shuffle([...UPGRADES]).slice(0, safeCount);
}

export function applyUpgrade(player: PlayerState, id: string): boolean {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade) return false;
  const current = readOwned(player);
  upgrade.apply(player);
  current.push(id);
  player.upgrades = JSON.stringify(current);
  return true;
}
