#!/usr/bin/env node
// One-command setup on YOUR OWN Cloudflare account:
//   Cloudflare login -> KV namespace -> wrangler.jsonc -> deploy -> secrets.
// Your MU password is typed into wrangler's hidden prompt and goes straight to
// Cloudflare's encrypted secret store; this script never reads or prints it.
//
//   npm run setup            first-time setup (safe to re-run)
//   npm run setup -- --secrets   re-enter all secrets
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const KV_TITLE = 'is-notion-sync';
const CONFIG = 'wrangler.jsonc';
const TEMPLATE = 'wrangler.example.jsonc';
const SECRETS = [
  ['RUN_PASSWORD', 'a password for the /run endpoint (make one up)'],
  ['IS_UCO', 'your UČO'],
  ['IS_PASSWORD', 'your PRIMARY MU password (the one you log in to IS with)'],
  ['NOTION_TOKEN', 'the "Internal Integration Secret" of your IS Sync integration (notion.so/profile/integrations)'],
];
const resetSecrets = process.argv.includes('--secrets');

const npx = (args, { capture = false, input } = {}) => {
  const r = spawnSync('npx', ['--yes', 'wrangler', ...args], {
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input, encoding: 'utf8', shell: process.platform === 'win32',
  });
  // out = stdout only (machine-readable); all = stdout + stderr (for error messages)
  return { ok: r.status === 0, out: r.stdout ?? '', all: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const step = (s) => console.log(`\n\x1b[1m▸ ${s}\x1b[0m`);
const die = (s) => { console.error(`\n✗ ${s}`); process.exit(1); };

export function parseKvId(out) {
  return out.match(/"id"\s*:\s*"([0-9a-f]{32})"/)?.[1] ?? null;
}
export function findKvId(listJson, title) {
  // wrangler may print a banner around the JSON array; take the outermost [...] block
  const start = listJson.search(/^\s*\[/m), end = listJson.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(listJson.slice(start, end + 1)).find((n) => n.title === title)?.id ?? null;
  } catch { return null; }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) die('Node.js 20 or newer is required.');

  step('Cloudflare login');
  if (!npx(['whoami'], { capture: true }).all.includes('You are logged in')) {
    console.log('A browser window will open; log in or create a free Cloudflare account.');
    if (!npx(['login']).ok) die('Cloudflare login failed.');
  } else console.log('Already logged in.');

  step('Storage (KV namespace)');
  if (existsSync(CONFIG)) {
    console.log(`${CONFIG} exists, keeping it.`);
  } else {
    let id = findKvId(npx(['kv', 'namespace', 'list'], { capture: true }).out, KV_TITLE);
    if (!id) {
      const created = npx(['kv', 'namespace', 'create', KV_TITLE], { capture: true });
      id = parseKvId(created.all);
      if (!id) die(`Could not create the KV namespace:\n${created.all}`);
      console.log(`Created KV namespace ${KV_TITLE}.`);
    } else console.log(`Reusing existing KV namespace ${KV_TITLE}.`);
    writeFileSync(CONFIG, readFileSync(TEMPLATE, 'utf8').replace('YOUR_KV_NAMESPACE_ID', id));
    console.log(`Wrote ${CONFIG}.`);
  }

  step('Deploy');
  const deployed = npx(['deploy'], { capture: true });
  process.stdout.write(deployed.all);
  if (!deployed.ok) die('Deploy failed (see above). On a brand-new account, run `npx wrangler deploy` once by hand to pick a workers.dev subdomain, then re-run setup.');
  const url = deployed.all.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];

  step('Secrets (stored encrypted by Cloudflare; input is hidden)');
  const have = npx(['secret', 'list', '--format', 'json'], { capture: true }).all;
  for (const [name, what] of SECRETS) {
    if (!resetSecrets && have.includes(`"${name}"`)) { console.log(`${name}: already set (use --secrets to change)`); continue; }
    console.log(`\n${name}: ${what}`);
    if (!npx(['secret', 'put', name]).ok) die(`Setting ${name} failed.`);
  }

  step('Done');
  console.log(`Dry run:  curl -u x:<RUN_PASSWORD> ${url ?? 'https://<your worker>.workers.dev'}/run`);
  console.log(`Real run: curl -u x:<RUN_PASSWORD> -X POST -H 'x-run: 1' ${url ?? 'https://<your worker>.workers.dev'}/run`);
  console.log('After that the cron runs every 2 hours by itself.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
