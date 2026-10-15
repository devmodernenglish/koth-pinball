import { HAZARD_DURATION_MS, type ErrorCode, type GameState, type ServerToClient, type SlotIndex } from '@koth/shared';
import { createInitialState, reduce, slotOf, validateHazard, type ServerEvent } from './reducer';
import { parseClientMessage, sanitizeName } from './protocol';

// One match, independent of the socket library. The Node server (index.ts) and the
// Cloudflare Durable Object (apps/worker) both drive it through the Transport interface.

const SCORE_MIN_INTERVAL_MS = 500; // per slot, so the cabinet sends at most 4 score messages/s
// Proxies (Cloudflare's included) drop WebSockets that stay silent for ~100 s, and snapshots only go out on change.
const HEARTBEAT_MS = 25_000;
export const REPLACED_CODE = 4000;

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  insufficientPoints: 'Not enough points for that hazard yet.',
  cooldown: 'That half is cooling down. Try again in a moment.',
  notInSlot: 'You can’t do that right now.',
};

export interface Transport {
  send(text: string): void;
  close(code: number, reason: string): void;
  isOpen(): boolean;
}

export interface Connection {
  message(raw: string): void;
  close(): void;
}

type Client = { transport: Transport; role: 'cabinet' | 'controller' | 'pending'; playerId?: string };

export interface RoomOptions {
  log?: (line: string) => void;
}

export function createRoom({ log = () => {} }: RoomOptions = {}) {
  let state: GameState = createInitialState(Date.now());
  let cabinet: Client | null = null;
  const lastScoreAt: Record<SlotIndex, number> = { 0: 0, 1: 0 };
  const clients = new Set<Client>();
  let guestCounter = 0;
  let lastBroadcastAt = Date.now();

  function send(client: Client | null, message: ServerToClient): void {
    if (client && client.transport.isOpen()) client.transport.send(JSON.stringify(message));
  }

  function broadcastState(): void {
    lastBroadcastAt = Date.now();
    const frame = JSON.stringify({ type: 'state', state } satisfies ServerToClient);
    for (const client of clients) {
      if (client.role !== 'pending' && client.transport.isOpen()) client.transport.send(frame);
    }
  }

  /** Applies an event to the reducer and broadcasts a snapshot if anything changed. */
  function dispatch(event: ServerEvent): void {
    const next = reduce(state, event);
    if (next === state) return;
    state = next;
    broadcastState();
  }

  function handle(client: Client, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) {
      log(`rejected malformed message from ${client.role} client`);
      return;
    }
    const now = Date.now();

    switch (message.type) {
      case 'hello': {
        if (client.role !== 'pending') return;
        if (message.role === 'cabinet') {
          // FR-S8: a second cabinet replaces the first.
          if (cabinet && cabinet !== client) cabinet.transport.close(REPLACED_CODE, 'replaced by a new cabinet');
          cabinet = client;
          client.role = 'cabinet';
          log('cabinet connected');
          dispatch({ type: 'cabinet', connected: true });
          send(client, { type: 'state', state });
          send(client, { type: 'serve', slot: state.rally.servingSlot });
        } else {
          client.role = 'controller';
          client.playerId = crypto.randomUUID();
          guestCounter += 1;
          const name = sanitizeName(message.name, `Player ${guestCounter}`);
          log(`controller joined: ${name}`);
          send(client, { type: 'welcome', playerId: client.playerId });
          send(client, { type: 'state', state });
          dispatch({ type: 'join', playerId: client.playerId, name, now });
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
  }

  function disconnect(client: Client): void {
    if (!clients.delete(client)) return;
    if (client === cabinet) {
      cabinet = null;
      log('cabinet disconnected');
      dispatch({ type: 'cabinet', connected: false });
    } else if (client.playerId) {
      log(`controller left: ${client.playerId}`);
      dispatch({ type: 'disconnect', playerId: client.playerId, now: Date.now() });
    }
  }

  return {
    connect(transport: Transport): Connection {
      const client: Client = { transport, role: 'pending' };
      clients.add(client);
      return { message: (raw) => handle(client, raw), close: () => disconnect(client) };
    },
    /** Call once a second: spectator points, plus a keep-alive snapshot when nothing else was sent. */
    tick(): void {
      const now = Date.now();
      dispatch({ type: 'tick', now });
      if (now - lastBroadcastAt >= HEARTBEAT_MS) broadcastState();
    },
    get clientCount(): number {
      return clients.size;
    },
  };
}

export type Room = ReturnType<typeof createRoom>;
