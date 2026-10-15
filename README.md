# ♛ King of the Hill Pinball

Real-time, head-to-head pinball for two players sharing **one ball on one split-screen table**.
Drain the ball on your opponent's side to win the rally; winner stays on, the loser rotates to the
back of the queue, and bots fill any empty half so the cabinet never stops playing.

## Run it

```bash
pnpm install
pnpm dev          # starts the ws server (:3001) and the Vite app (:5173) together
```

- **Cabinet** (big screen): <http://localhost:5173/cabinet>
- **Controllers** (phones/laptops on the same Wi-Fi): scan the QR code on the cabinet, or open
  `http://<host-LAN-IP>:5173/play`. The server prints the exact URL on start-up.

The cabinet starts in bot-vs-bot attract mode immediately, and keeps playing offline if the server is down.

### HTTPS

```bash
pnpm cert         # one-off: mkcert certificate for localhost, your LAN IP and <hostname>.local, written to .certs/
```

Once `.certs/` exists, `pnpm dev` serves `https://localhost:5173` and the WebSocket upgrades to `wss` through the
Vite proxy (the ws server itself stays on plain http behind it). The QR code then points at `https://<LAN-IP>:5173/play`.

- Re-run `pnpm cert` if your LAN IP changes.
- Phones only trust the cert once they trust the mkcert root CA (`mkcert -CAROOT` shows where `rootCA.pem` is).
  AirDrop or email it to the phone and install it. On iOS you must also enable it under
  Settings → General → About → Certificate Trust Settings. Without it, phones show a warning you can tap through.
- `KOTH_HTTP=1 pnpm dev` forces plain http.

### Controls

| Where | Left flipper | Right flipper | Plunger (hold to charge) |
| --- | --- | --- | --- |
| Phone | left pad | right pad | launch pad |
| Controller keyboard | `Z` | `/` | `Space` |
| Cabinet keyboard (testing) | `A` / `J` | `D` / `L` | `S` / `K` |

Cabinet keys drive the left half (A/D/S) or right half (J/L/K) directly and make that half's bot stand down for 15 s.

## Deploying to Cloudflare

The site is on Cloudflare Pages; the match server runs as a separate Worker with one Durable Object
(`apps/worker`, deployed as `koth-server`). Phones connect to `wss://<site>/ws`, and `functions/ws.ts`
hands that connection to the Worker through the `GAME` service binding in the root `wrangler.toml`.

```
browser ──/ws──▶ Pages Function (functions/ws.ts) ──GAME binding──▶ koth-server Worker ──▶ GameRoom Durable Object
```

1. Deploy the Worker once (and again whenever server code changes):

   ```bash
   npx --prefix apps/worker wrangler login
   pnpm deploy:server
   ```

2. Push to GitHub. Pages picks up the `GAME` binding from `wrangler.toml` on the next build.
   The service must exist first: a Pages build that runs before step 1 serves `/ws` as 503.

- Worker logs: `npx --prefix apps/worker wrangler tail koth-server` (shows `cabinet connected`, `controller joined: …`).
- Test the whole Cloudflare path locally: `pnpm --filter @koth/worker dev` in one terminal, then
  `pnpm build && npx --prefix apps/worker wrangler pages dev apps/web/dist` in another.
- Match state is in memory, as locally: it resets when the Durable Object is evicted after everyone leaves.

## Checks

```bash
pnpm lint        # ESLint (no `any`, script-setup + TS only) + style rules (no hex/px in components, scoped SCSS, BEM root)
pnpm typecheck   # tsc / vue-tsc, strict
pnpm test        # Vitest: reducer rally rules + headless physics acceptance run
```

The physics test runs five simulated minutes of bot-vs-bot play headless and asserts that rallies resolve,
the ball crosses the centre at least once per rally on average, and it never passes through the divider or leaves the table.

## Layout

```
apps/server/src     index.ts (Node ws wiring) · room.ts (match wiring, transport-agnostic) · reducer.ts (pure state machine)
                    · protocol.ts (zod) · reducer.test.ts
apps/worker/src     index.ts (Cloudflare Worker + GameRoom Durable Object, runs room.ts)
functions/ws.ts     Pages Function: forwards /ws to the Worker
apps/web/src
  physics/          constants · geometry · buildHalf · buildDivider · table (one Matter.js world) · botBrain · render · attract
  composables/      useSocket · usePinballWorld · useBotController · useHazards
  components/       atoms · molecules · organisms · templates (layout slots)
  stores/game.ts    Pinia mirror of the latest GameState
  views/            CabinetView · PlayView
packages/shared     protocol types and constants
```

## Design decisions worth knowing

- **One physics world, on the cabinet only.** The server never simulates; it is a pure reducer over slots, queue, points and streaks.
- **A lone human who loses re-enters immediately.** The loser goes to the back of the queue and the first queued human takes the
  half — with nobody else waiting, that's the same player. Otherwise a solo demo player would be benched for a bot rally.
- **Hazards are spectator-only.** Only queued players can fire them (they're the only ones earning points).
- **Flippers** are dynamic bodies on a hinge constraint driven by angular velocity, clamped and re-seated at their limits to remove hinge drift.
- **Safety nets:** a speed cap every substep, a one-way gate on each plunger lane, a stuck-ball nudge after 3.5 s, auto-launch after 8 s
  in a lane, and a stalemate breaker at 60 s (centre kickers + 20 % higher speed cap).

## Open questions (from the PRD, not yet decided)

- Minimum rally length before a drain counts (protect a new player's first serve)? Not implemented.
- 60 s vs 30 s stalemate breaker: change `STALEMATE_MS` in `packages/shared/src/index.ts`.
