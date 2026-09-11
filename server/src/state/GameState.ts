import { MapSchema, Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type("string") name = "Player";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("number") kills = 0;
  @type("boolean") ready = false;
}

export class GameState extends Schema {
  @type("string") phase = "lobby";
  @type("number") wave = 0;
  @type("number") elapsedMs = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
