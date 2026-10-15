// Cloudflare Pages Function: hands /ws (including the WebSocket upgrade) to the match server Worker,
// so the web app keeps connecting to its own origin. GAME is the service binding in wrangler.toml.
interface Env {
  GAME?: { fetch(request: Request): Promise<Response> };
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.GAME) {
    return new Response('Match server not bound: deploy apps/worker and check the GAME service binding.', { status: 503 });
  }
  return env.GAME.fetch(request);
};
