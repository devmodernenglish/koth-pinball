import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const SERVER = process.env.KOTH_SERVER ?? 'localhost:3001';

// HTTPS turns on when `pnpm cert` has created a certificate. The ws server stays on plain http
// behind the proxy, so the browser only ever talks to Vite (https + wss).
const certDir = fileURLToPath(new URL('../../.certs/', import.meta.url));
const https =
  process.env.KOTH_HTTP !== '1' && existsSync(`${certDir}cert.pem`) && existsSync(`${certDir}key.pem`)
    ? { cert: readFileSync(`${certDir}cert.pem`), key: readFileSync(`${certDir}key.pem`) }
    : undefined;

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Tokens, functions and mixins are available in every component without imports.
        additionalData: `@use "@/styles/tokens" as *;\n@use "@/styles/functions" as *;\n@use "@/styles/mixins" as *;\n`,
      },
    },
  },
  server: {
    host: true, // reachable from phones on the LAN
    port: 5173,
    https,
    proxy: {
      '/ws': { target: `ws://${SERVER}`, ws: true },
      '/api': { target: `http://${SERVER}` },
    },
  },
  preview: {
    host: true,
    port: 5173,
    https,
    proxy: {
      '/ws': { target: `ws://${SERVER}`, ws: true },
      '/api': { target: `http://${SERVER}` },
    },
  },
});
