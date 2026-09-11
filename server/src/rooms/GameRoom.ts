import { Room, Client } from "colyseus";
import { GAME, WAVE } from "../../../shared/src/constants.js";
import { GameState, PlayerState } from "../state/GameState.js";

interface JoinOptions {
  name?: string;
}

interface InputMessage {
  dx?: number;
  dy?: number;
}

export class GameRoom extends Room<GameState> {
  maxClients = GAME.maxPlayers;

  onCreate() {
    this.setState(new GameState());
    this.autoDispose = true;

    this.onMessage("ready", (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.ready = Boolean(ready);

      const players = Array.from(this.state.players.values());
      if (this.state.phase === "lobby" && players.length > 0 && players.every((p) => p.ready)) {
        this.state.phase = "playing";
        this.state.wave = 1;
        this.state.elapsedMs = 0;
      }
    });

    this.onMessage("input", (client, message: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing") return;

      const dx = Math.max(-1, Math.min(1, Number(message?.dx ?? 0)));
      const dy = Math.max(-1, Math.min(1, Number(message?.dy ?? 0)));
      const length = Math.hypot(dx, dy);
      const nx = length > 1 ? dx / length : dx;
      const ny = length > 1 ? dy / length : dy;
      const dt = 1 / GAME.serverHz;

      player.x = Math.max(40, Math.min(GAME.width - 40, player.x + nx * GAME.playerSpeed * dt));
      player.y = Math.max(40, Math.min(GAME.height - 40, player.y + ny * GAME.playerSpeed * dt));
    });

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs), 1000 / GAME.serverHz);
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState();
    player.name = typeof options?.name === "string" && options.name.trim() ? options.name.trim().slice(0, 18) : `Player ${this.clients.length}`;
    player.x = 300 + this.clients.length * 80;
    player.y = 540;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.players.size === 0) this.state.phase = "lobby";
  }

  private tick(deltaMs: number) {
    if (this.state.phase !== "playing") return;

    this.state.elapsedMs += deltaMs;
    const waveLength = WAVE.firstDurationMs;
    const nextWave = Math.floor(this.state.elapsedMs / waveLength) + 1;
    if (nextWave !== this.state.wave) this.state.wave = nextWave;
  }
}
