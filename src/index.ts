// Worker entry: cron runs the sync; a password-protected HTTP endpoint shows the last run
// and lets you trigger a dry run (GET /run) or a real one (POST /run with header x-run: 1).
import { type Env, LAST_RUN_KEY, type RunLog, run } from './sync';

export default {
  async scheduled(_c: ScheduledController, env: Env): Promise<void> {
    const log = await run(env, 'real');
    await env.KV.put(LAST_RUN_KEY, JSON.stringify(log));
    console.log(JSON.stringify(summary(log)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const denied = checkAuth(req, env);
    if (denied) return denied;
    const { pathname } = new URL(req.url);
    if (pathname === '/' && req.method === 'GET') {
      return json({ lastRun: await env.KV.get(LAST_RUN_KEY, 'json'), help: 'GET /run = dry run (nothing written); POST /run with header "x-run: 1" = real run' });
    }
    if (pathname === '/run' && req.method === 'GET') return json(await run(env, 'dry'));
    if (pathname === '/run' && req.method === 'POST') {
      if (req.headers.get('x-run') !== '1') return json({ error: 'missing x-run: 1 header' }, 403);
      const log = await run(env, 'real');
      await env.KV.put(LAST_RUN_KEY, JSON.stringify(log));
      return json(log);
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

function summary(log: RunLog) {
  const done = log.actions.filter(a => a.status === 'done').length;
  return { at: log.at, ok: log.ok, error: log.error, done, failed: log.actions.length - done, pending: log.pending, requests: log.requests, warnings: log.warnings };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

function checkAuth(req: Request, env: Env): Response | null {
  if (!env.RUN_PASSWORD) return new Response('Set the RUN_PASSWORD secret first: npx wrangler secret put RUN_PASSWORD', { status: 503 });
  const header = req.headers.get('authorization') ?? '';
  let given = '';
  if (header.startsWith('Basic ')) {
    try { given = atob(header.slice(6)).split(':').slice(1).join(':'); } catch { /* malformed */ }
  }
  if (given && timingSafeEqual(given, env.RUN_PASSWORD)) return null;
  return new Response('Authentication required', { status: 401, headers: { 'www-authenticate': 'Basic realm="is-notion-sync", charset="UTF-8"' } });
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
