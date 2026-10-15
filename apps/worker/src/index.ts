import { DurableObject } from 'cloudflare:workers';
import { createRoom, type Room } from '@koth/server/room';

interface Env {
  ROOM: DurableObjectNamespace<GameRoom>;
}

const TICK_MS = 1000;

/**
 * The whole match lives in one Durable Object, so every cabinet and controller talks to the same
 * in-memory state, just like the single Node process. State is in memory only (PRD non-goal: no
 * persistence); it resets if Cloudflare evicts the object after everyone has left.
 */
export class GameRoom extends DurableObject<Env> {
  private readonly room: Room;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = createRoom({ log: (line) => console.log(`[koth] ${line}`) });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    const connection = this.room.connect({
      send: (text) => server.send(text),
      close: (code, reason) => server.close(code, reason),
      isOpen: () => server.readyState === WebSocket.OPEN,
    });
    server.addEventListener('message', (event) => connection.message(String(event.data)));
    server.addEventListener('close', () => this.drop(connection.close));
    server.addEventListener('error', () => this.drop(connection.close));

    // Spectator points and keep-alives only matter while someone is connected.
    this.ticker ??= setInterval(() => this.room.tick(), TICK_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private drop(close: () => void): void {
    close();
    if (this.room.clientCount === 0 && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      // One match for everyone: always route to the same object.
      return env.ROOM.get(env.ROOM.idFromName('main')).fetch(request);
    }
    if (url.pathname === '/') return new Response('King of the Hill Pinball match server. Connect to /ws.');
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
