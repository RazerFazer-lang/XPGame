# XPGame

XPGame is a local-first cooperative 2D horde-survival browser game.

## Stack

- TypeScript
- Phaser 4
- Node.js
- Colyseus
- Vite

## Start locally

Requirements: Node.js 20+ recommended.

```bash
npm install
npm run dev
```

This starts two local processes:

- Vite client: `http://localhost:5173`
- Colyseus game server: `ws://localhost:3000`

Open the Vite URL in the host browser. The client automatically connects to the game server on port 3000.

## LAN / Hamachi

The development servers bind to `0.0.0.0`. From another machine, open the host's Vite address:

```text
http://HOST_IP:5173
```

For Hamachi, use the host's Hamachi IPv4 address, for example:

```text
http://25.xxx.xxx.xxx:5173
```

The browser client then connects to the game server on port `3000` at the same hostname.

If Windows Firewall blocks the connection, allow Node.js/Vite and the configured ports for the private network profile.

Environment variables:

```text
PORT=3000
HOST=0.0.0.0
VITE_GAME_SERVER_PORT=3000
```

## Current implemented systems

The repository now contains a real playable core rather than only a project scaffold:

- authoritative Colyseus multiplayer room
- up to 4 players
- lobby and ready state
- server-authoritative WASD movement
- mouse aiming
- held-fire combat
- multi-projectile weapons
- crits, pierce and projectile scaling
- XP crystals
- XP collection and level progression
- data-driven upgrade choices
- 12 initial upgrades
- build stats for damage, attack speed, projectile count, projectile speed, pierce, movement, pickup radius, armor and crits
- basic, fast, tank and ranged enemies
- elite enemies every 5 waves
- boss spawning every 10 waves
- server-side difficulty scaling
- enemy contact damage
- game-over state
- spatial partitioning for projectile/enemy collision checks
- polished HUD and level-up selection overlay
- keyboard shortcuts for upgrade selection
- procedural lightweight feedback audio
- responsive layout
- GitHub Actions typecheck/build pipeline

## Build verification

```bash
npm run typecheck
npm run build
```

The GitHub Actions workflow runs both commands on pushes and pull requests.

## Development direction

The remaining expansion is focused on:

1. co-op downed/revive system
2. boss phases and boss health presentation
3. additional weapon families
4. status effects and build synergies
5. additional maps and map interaction
6. persistent local meta progression
7. settings/audio controls
8. particle and animation pooling
9. performance stress scenes and profiling
10. full run results/victory flow
