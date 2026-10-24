# TREASURE CLASH: FRIENDS BATTLE

A browser-based, real-time multiplayer treasure game for 2–4 friends. No player account or installation is required. The game server is authoritative for rooms, turns, movement, loot, scoring, and the five-minute clock.

## Requirements
- Node.js 20 or newer
- npm

## Run locally
1. Install Node.js from https://nodejs.org/ if it is not already installed.
2. Open a terminal in this project folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the Vite URL shown in the terminal (normally http://localhost:5173).

The frontend development server proxies `/ws` to the game server on port 3001. To test from another device on the same Wi-Fi, run Vite with `--host 0.0.0.0` (already configured) and use your computer's LAN IP; configure the websocket proxy target to that device/server if necessary. For a true public game, deploy the combined service as below.

## Production build
```sh
npm install
npm run build
npm start
```
The Node server serves the built frontend and WebSocket endpoint from the same origin. `GET /health` returns a basic health check.

## Deploy publicly on Render
1. Create a GitHub account if needed and create a new repository.
2. Upload/push the contents of this project folder to that repository.
3. Sign in to https://render.com/ and create **New + → Web Service**, then connect the repository.
4. Set **Runtime** to Node, **Build Command** to `npm install && npm run build`, and **Start Command** to `npm start`.
5. Deploy. Render provides a public HTTPS URL; open it and share that URL plus the room code with friends.
6. Visit `<your-service-url>/health` to verify the service is responding.

No API key or database credential is required for this version. The server uses in-memory rooms, so active games are lost if the server restarts or sleeps. For production scale, add a shared persistent room backend/adapter and rate limiting. Use a host that supports long-lived WebSocket connections; do not deploy this as a serverless function.

## Game rules
- Create a room or join with a five-character room code.
- 2–4 unique names per room; the creator is host.
- Host starts after at least two players have joined.
- Turns rotate between players; each turn has up to three adjacent moves.
- Gold = 10, gem = 25, chest = a random 10–40, power-up = 5 plus a bonus move.
- Rocks and occupied tiles block movement.
- The server ends the match after five minutes; highest score wins, ties are shared.
- Host can start a rematch after the match ends.

## Known limitations
- Rooms are stored in memory, not a database; deploy one server instance for this version.
- Disconnects are reflected to other players and stale players are removed after 45 seconds. A full reconnect/resume flow is not yet implemented.
- Sound toggle is a UI control placeholder; the game does not require sound to play.
- The game has no accounts or long-term stats.
