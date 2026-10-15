import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { HAZARD_DURATION_MS, type ErrorCode, type GameState, type ServerToClient, type SlotIndex } from '@koth/shared';
import { createInitialState, reduce, slotOf, validateHazard, type ServerEvent } from './reducer';
import { parseClientMessage, sanitizeName } from './protocol';

const PORT = Number(process.env.PORT ?? 3001);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
// Matches the web app: it serves https whenever `pnpm cert` has created .certs/cert.pem.
const WEB_PROTOCOL =
  process.env.KOTH_HTTP !== '1' && existsSync(new URL('../../../.certs/cert.pem', import.meta.url)) ? 'https' : 'http';
const SCORE_MIN_INTERVAL_MS = 500; // per slot, so the cabinet sends at most 4 score messages/s

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  insufficientPoints: 'Not enough points for that hazard yet.',
  cooldown: 'That half is cooling down. Try again in a moment.',
  notInSlot: 'You can’t do that right now.',
};

type Client = { socket: WebSocket; role: 'cabinet' | 'controller' | 'pending'; playerId?: string };

let state: GameState = createInitialState(Date.now());
let cabinet: Client | null = null;
const lastScoreAt: Record<SlotIndex, number> = { 0: 0, 1: 0 };
const clients = new Set<Client>();
let guestCounter = 0;

function send(client: Client | null, message: ServerToClient): void {
  if (client && client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(message));
}

function broadcastState(): void {
  const frame = JSON.stringify({ type: 'state', state } satisfies ServerToClient);
  for (const client of clients) {
    if (client.role !== 'pending' && client.socket.readyState === WebSocket.OPEN) client.socket.send(frame);
  }
}

/** Applies an event to the reducer and broadcasts a snapshot if anything changed. */
function dispatch(event: ServerEvent): void {
  const next = reduce(state, event);
  if (next === state) return;
  state = next;
  broadcastState();
}

function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const http = createServer((req, res) => {
  if (req.url === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ lanIp: lanAddress(), webPort: WEB_PORT, playUrl: `${WEB_PROTOCOL}://${lanAddress()}:${WEB_PORT}/play` }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (socket) => {
  const client: Client = { socket, role: 'pending' };
  clients.add(client);

  socket.on('message', (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) return; // reject anything malformed
    const now = Date.now();

    switch (message.type) {
      case 'hello': {
        if (client.role !== 'pending') return;
        if (message.role === 'cabinet') {
          // FR-S8: a second cabinet replaces the first.
          if (cabinet && cabinet !== client) cabinet.socket.close(4000, 'replaced by a new cabinet');
          cabinet = client;
          client.role = 'cabinet';
          dispatch({ type: 'cabinet', connected: true });
          send(client, { type: 'state', state });
          send(client, { type: 'serve', slot: state.rally.servingSlot });
        } else {
          client.role = 'controller';
          client.playerId = randomUUID();
          guestCounter += 1;
          send(client, { type: 'welcome', playerId: client.playerId });
          send(client, { type: 'state', state });
          dispatch({
            type: 'join',
            playerId: client.playerId,
            name: sanitizeName(message.name, `Player ${guestCounter}`),
            now,
          });
        }
        return;
      }

      case 'input': {
        // FR-S6: relay only from the slot owner, only to the cabinet.
        if (client.role !== 'controller' || !client.playerId) return;
        const slot = slotOf(state, client.playerId);
        if (slot === null) return;
        send(cabinet, { type: 'input', slot, side: message.side, pressed: message.pressed });
        return;
      }

      case 'hazard': {
        // FR-S7: validate, deduct, forward.
        if (client.role !== 'controller' || !client.playerId) return;
        const error = validateHazard(state, client.playerId, message.kind, message.target, now);
        if (error) {
          send(client, { type: 'error', code: error, message: ERROR_MESSAGES[error] });
          return;
        }
        dispatch({ type: 'hazard', playerId: client.playerId, kind: message.kind, target: message.target, now });
        send(cabinet, { type: 'hazard', kind: message.kind, target: message.target, durationMs: HAZARD_DURATION_MS });
        return;
      }

      case 'drain': {
        if (client !== cabinet) return;
        // FR-S4: rotate, then tell the cabinet where to serve.
        dispatch({ type: 'drain', loserSlot: message.loserSlot, now });
        send(cabinet, { type: 'serve', slot: message.loserSlot });
        return;
      }

      case 'score': {
        if (client !== cabinet) return;
        if (now - lastScoreAt[message.slot] < SCORE_MIN_INTERVAL_MS) return;
        lastScoreAt[message.slot] = now;
        dispatch({ type: 'score', slot: message.slot, rallyPoints: message.rallyPoints });
        return;
      }
    }
  });

  socket.on('close', () => {
    clients.delete(client);
    if (client === cabinet) {
      cabinet = null;
      dispatch({ type: 'cabinet', connected: false });
    } else if (client.playerId) {
      dispatch({ type: 'disconnect', playerId: client.playerId, now: Date.now() });
    }
  });
});

setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1000);

http.listen(PORT, '0.0.0.0', () => {
  console.log(`[koth] server on :${PORT}  ·  controllers join at ${WEB_PROTOCOL}://${lanAddress()}:${WEB_PORT}/play`);
});
