// Creates a locally trusted HTTPS certificate for the Vite dev server with mkcert.
// Covers localhost, this machine's LAN IPs and its .local hostname, so phones on the Wi-Fi can use it too.
// Re-run it if your LAN IP changes.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';

const dir = new URL('../.certs/', import.meta.url).pathname;

function mkcert(args) {
  return execFileSync('mkcert', args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
}

try {
  mkcert(['-help']);
} catch {
  console.error('mkcert is not installed. Install it with `brew install mkcert`, then run `pnpm cert` again.');
  process.exit(1);
}

const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === 'IPv4' && !net.internal)
  .map((net) => net.address);
const host = hostname().replace(/\.local$/, '');
const names = ['localhost', '127.0.0.1', '::1', `${host}.local`, ...lanIps];

mkdirSync(dir, { recursive: true });
execFileSync('mkcert', ['-install'], { stdio: 'inherit' });
execFileSync('mkcert', ['-cert-file', `${dir}cert.pem`, '-key-file', `${dir}key.pem`, ...names], { stdio: 'inherit' });

console.log(`\nCertificate written to .certs/ for: ${names.join(', ')}`);
console.log(`Phones must trust the mkcert root CA to avoid a warning. It is at:\n  ${mkcert(['-CAROOT'])}/rootCA.pem`);
