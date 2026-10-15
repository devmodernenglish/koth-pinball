import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoom } from './room';

const PORT = Number(process.env.PORT ?? 3001);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
// Matches the web app: it serves https whenever `pnpm cert` has created .certs/cert.pem.
const WEB_PROTOCOL =
  process.env.KOTH_HTTP !== '1' && existsSync(new URL('../../../.certs/cert.pem', import.meta.url)) ? 'https' : 'http';

const room = createRoom({ log: (line) => console.log(`[koth] ${line}`) });

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
  const connection = room.connect({
    send: (text) => socket.send(text),
    close: (code, reason) => socket.close(code, reason),
    isOpen: () => socket.readyState === WebSocket.OPEN,
  });
  socket.on('message', (data) => connection.message(data.toString()));
  socket.on('close', () => connection.close());
});

setInterval(() => room.tick(), 1000);

http.listen(PORT, '0.0.0.0', () => {
  console.log(`[koth] server on :${PORT}  ·  controllers join at ${WEB_PROTOCOL}://${lanAddress()}:${WEB_PORT}/play`);
});
