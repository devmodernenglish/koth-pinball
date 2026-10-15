import { computed, getCurrentScope, onScopeDispose } from 'vue';
import type { ClientToServer, ServerToClient } from '@koth/shared';
import { useGameStore } from '@/stores/game';

type MessageType = ServerToClient['type'];
type MessageOf<T extends MessageType> = Extract<ServerToClient, { type: T }>;
type AnyHandler = (message: ServerToClient) => void;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const REPLACED_CODE = 4000;

function isServerMessage(value: unknown): value is ServerToClient {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/**
 * One WebSocket to the match server. Mirrors snapshots into the game store and reconnects with
 * exponential backoff, re-sending `hello` so the client rejoins as a new player (FR-P4).
 */
export function useSocket() {
  const store = useGameStore();
  const handlers = new Map<MessageType, Set<AnyHandler>>();
  let socket: WebSocket | null = null;
  let hello: ClientToServer | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  function open(): void {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    socket = ws;

    ws.addEventListener('open', () => {
      attempt = 0;
      store.setConnected(true);
      if (hello) ws.send(JSON.stringify(hello));
    });

    ws.addEventListener('message', (event) => {
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isServerMessage(data)) return;
      if (data.type === 'welcome') store.setPlayerId(data.playerId);
      else if (data.type === 'state') store.applyState(data.state);
      else if (data.type === 'error') store.showToast(data.code, data.message);
      handlers.get(data.type)?.forEach((h) => h(data));
    });

    ws.addEventListener('close', (event) => {
      if (socket !== ws) return;
      socket = null;
      store.setConnected(false);
      store.setPlayerId(null);
      if (stopped || event.code === REPLACED_CODE) return;
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) * (0.8 + Math.random() * 0.4);
      attempt += 1;
      retryTimer = setTimeout(open, delay);
    });
  }

  function connect(message: ClientToServer): void {
    hello = message;
    stopped = false;
    if (!socket) open();
  }

  function disconnect(): void {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    socket?.close();
    socket = null;
    store.setConnected(false);
  }

  function send(message: ClientToServer): void {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function on<T extends MessageType>(type: T, handler: (message: MessageOf<T>) => void): () => void {
    const set = handlers.get(type) ?? new Set<AnyHandler>();
    const wrapped: AnyHandler = (m) => handler(m as MessageOf<T>);
    set.add(wrapped);
    handlers.set(type, set);
    return () => set.delete(wrapped);
  }

  if (getCurrentScope()) onScopeDispose(disconnect);

  return { connect, disconnect, send, on, connected: computed(() => store.connected) };
}

export type SocketHandle = ReturnType<typeof useSocket>;
