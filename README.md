# XPGame

XPGame is a local-first cooperative 2D horde-survival browser game.

## Stack

- TypeScript
- Phaser 4
- Node.js
- Colyseus
- Vite

## Local development

Requirements: Node.js 20+ recommended.

```bash
npm install
npm run dev
```

The Vite client and multiplayer server are started together. The server defaults to port `3000` and binds to `0.0.0.0` for local network use.

## LAN / Hamachi

Start the host machine and find its reachable LAN or Hamachi IPv4 address. Other players should open the Vite URL on the host machine using that address. If the configured client port differs from the default, use that port.

If Windows Firewall blocks the connection, allow Node.js/the configured port for the private network profile.

Environment variables:

```text
PORT=3000
HOST=0.0.0.0
```

## Current vertical slice

The initial implementation establishes:

- client/server project structure
- authoritative Colyseus room
- multiplayer player state
- join flow
- ready state
- wave timer state
- WASD movement input
- Phaser game canvas
- basic local multiplayer visualization
- responsive starter HUD

The next phases add combat, XP pickups, level-up choices, enemies, wave director, elites, bosses, progression, audio, effects and performance stress testing.
