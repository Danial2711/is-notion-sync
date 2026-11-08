// End-to-end: fake IS + fake Notion + in-memory KV, real run() logic.
import * as F from './fixtures';
import { type Env, run } from './sync';

type Page = { id: string; db: string; properties: Record<string, any> };

function fakeNotion() {
  const pages: Page[] = [];
  let seq = 0;
  const read = (props: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(props)) {
      if ('title' in v) out[k] = { type: 'title', title: v.title.map((t: any) => ({ plain_text: t.text.content })) };
      else if ('rich_text' in v) out[k] = { type: 'rich_text', rich_text: v.rich_text.map((t: any) => ({ plain_text: t.text.content })) };
      else if ('url' in v) out[k] = { type: 'url', url: v.url };
      else if ('checkbox' in v) out[k] = { type: 'checkbox', checkbox: v.checkbox };
      else if ('select' in v) out[k] = { type: 'select', select: v.select };
      else if ('relation' in v) out[k] = { type: 'relation', relation: v.relation.map((r: any) => ({ id: r.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') })) };
      else if ('date' in v) out[k] = { type: 'date', date: v.date && { start: v.date.start.length > 10 ? `${v.date.start}.000+01:00` : v.date.start } };
    }
    return out;
  };
  const add = (db: string, props: Record<string, any>) => {
    const id = `0000000000000000000000000000${String(++seq).padStart(4, '0')}`;
    const p = { id: id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'), db, properties: read(props) };
    pages.push(p);
    return p;
  };
  const writes: string[] = [];
  const handle = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace('/v1', '');
    const body = init.body ? JSON.parse(String(init.body)) : {};
    let m;
    if ((m = path.match(/^\/databases\/(\w+)\/query$/))) {
      return Response.json({ results: pages.filter(p => p.db === m![1]), has_more: false, next_cursor: null });
    }
    if (path === '/pages' && init.method === 'POST') { writes.push('create'); return Response.json(add(body.parent.database_id, body.properties)); }
    if ((m = path.match(/^\/pages\/(.+)$/)) && init.method === 'PATCH') {
      writes.push('update');
      const p = pages.find(x => x.id === m![1])!;
      Object.assign(p.properties, read(body.properties));
      return Response.json(p);
    }
    return Response.json({ message: 'nope' }, { status: 404 });
  };
  return { pages, add, handle, writes, read };
}

function fakeIs() {
  let loggedIn = false;
  const posted: Record<string, string>[] = [];
  const pages: Record<string, string> = {
    '/auth/el/fi/podzim2026/PV079/ode/': F.PV079_ODE,
    '/auth/el/fi/podzim2026/PV079/um/assignments/': F.PV079_ASSIGNMENTS,
    '/auth/el/fi/podzim2026/PV198/um/': F.PV198_UM,
    '/auth/el/fi/podzim2026/IA174/index.qwarp': F.IA174_SYLLABUS,
    '/auth/student/poznamkove_bloky_nahled.pl': F.NOTEBOOKS,
    '/auth/student/prihl_na_zkousky.pl': F.EXAM_OVERVIEW,
    '/auth/student/prihl_na_zkousky': F.EXAM_SERIES,
  };
  const handle = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    if (u.hostname === 'muni.islogin.cz') {
      if (init.method === 'POST') {
        posted.push(Object.fromEntries(new URLSearchParams(String(init.body))));
        loggedIn = true;
        return new Response(null, { status: 302, headers: { location: 'https://is.muni.cz/auth/?lang=en', 'set-cookie': 'iscreds=abc; Domain=.muni.cz; Path=/' } });
      }
      return new Response(F.LOGIN_PAGE);
    }
    const cookie = new Headers(init.headers as HeadersInit).get('cookie') ?? '';
    if (!loggedIn || !cookie.includes('iscreds=abc')) return new Response(null, { status: 302, headers: { location: 'https://muni.islogin.cz/login/tok' } });
    if (u.pathname === '/auth/el/fi/podzim2026/IA174/index.qwarp' && u.search.includes('prejit=9620912')) return new Response(F.IA174_HW1);
    if (u.pathname === '/auth/el/fi/podzim2026/IA174/index.qwarp' && u.search.includes('prejit=9620916')) return new Response(F.IA174_HW2);
    const html = pages[u.pathname];
    if (html) return new Response(html);
    if (/\/(ode|um\/homeworks)\/$/.test(u.pathname)) return new Response(`<script>window.fmgrUzly = {"${u.pathname.replace('/auth', '')}":{}};</script>`);
    return new Response('not found', { status: 404 });
  };
  return { handle, posted };
}

const COURSES_DB = 'c0', ASSIGN_DB = 'a0', EXAMS_DB = 'e0';

function setup() {
  const notion = fakeNotion();
  const is = fakeIs();
  const kv = new Map<string, string>();
  const env: Env = {
    KV: { get: async (k: string, t?: string) => { const v = kv.get(k); return v && t === 'json' ? JSON.parse(v) : v ?? null; }, put: async (k: string, v: string) => { kv.set(k, v); } } as unknown as KVNamespace,
    IS_UCO: '123456', IS_PASSWORD: 'pw', NOTION_TOKEN: 'secret_x',
    NOTION_COURSES_DB: COURSES_DB, NOTION_ASSIGNMENTS_DB: ASSIGN_DB, NOTION_EXAMS_DB: EXAMS_DB,
  };
  const courses: Record<string, Page> = {};
  for (const code of ['IA174', 'PA191', 'PV079', 'PV181', 'PV198']) {
    courses[code] = notion.add(COURSES_DB, { 'Course Name': { title: [{ text: { content: code } }] }, 'Course Code': { rich_text: [{ text: { content: code } }] } });
  }
  const rel = (code: string) => ({ relation: [{ id: courses[code]!.id.replace(/-/g, '') }] });
  // Hand-made entries the user already has.
  const manualPv198 = notion.add(ASSIGN_DB, { 'Assignment Name': { title: [{ text: { content: 'Homework 04, Interrupts' } }] }, Courses: rel('PV198'), Deadline: { date: { start: '2026-10-13' } }, Done: { checkbox: true } });
  const manualPv079 = notion.add(ASSIGN_DB, { 'Assignment Name': { title: [{ text: { content: 'Assignment 2, Exploring colisions in Keccak' } }] }, Courses: rel('PV079'), Done: { checkbox: true } });
  const fetcher = (url: string, init: RequestInit) => (url.startsWith('https://api.notion.com') ? notion.handle(url, init) : is.handle(url, init));
  return { notion, is, env, fetcher, courses, manualPv198, manualPv079 };
}

const NOW = Date.parse('2026-11-08T11:00:00Z'); // 12:00 Prague
const titleOf = (p: Page) => p.properties['Assignment Name']?.title?.[0]?.plain_text ?? p.properties.Name?.title?.[0]?.plain_text;
const textOf = (p: Page, k: string) => (p.properties[k]?.rich_text ?? []).map((t: any) => t.plain_text).join('');

describe('sync run', () => {
  it('dry run plans without writing anything', async () => {
    const s = setup();
    const log = await run(s.env, 'dry', s.fetcher, NOW);
    expect(log.error).toBeUndefined();
    expect(log.actions.length).toBeGreaterThan(0);
    expect(log.actions.every(a => a.status === 'planned')).toBe(true);
    expect(s.notion.writes).toEqual([]);
    expect(s.is.posted[0]).toEqual({ credential_0: '123456', credential_1: 'pw', uloz: 'uloz' });
  });

  it('creates homework, adopts hand-made entries, and is idempotent', async () => {
    const s = setup();
    const log = await run(s.env, 'real', s.fetcher, NOW);
    expect(log.error).toBeUndefined();
    expect(log.ok).toBe(true);
    expect(log.requests).toBeLessThanOrEqual(48);

    const assignments = s.notion.pages.filter(p => p.db === ASSIGN_DB);
    const byId = (id: string) => assignments.find(p => textOf(p, 'IS ID') === id)!;

    // Adopted, user data untouched
    expect(byId('PV198:hw4').id).toBe(s.manualPv198.id);
    expect(titleOf(byId('PV198:hw4'))).toBe('Homework 04, Interrupts');
    expect(byId('PV198:hw4').properties.Deadline.date.start).toBe('2026-10-13');
    expect(byId('PV079:hw2').id).toBe(s.manualPv079.id);
    expect(textOf(byId('PV079:hw2'), 'Points')).toBe('4');

    // New open homework with deadline, in the calendar
    const hw4 = byId('PV079:hw4');
    expect(titleOf(hw4)).toBe('PV079 · HW04 Side channel');
    expect(hw4.properties.Deadline.date.start).toBe('2026-11-15T23:59:00.000+01:00');
    expect(hw4.properties.Done.checkbox).toBe(false);
    expect(hw4.properties.Courses.relation[0].id.replace(/-/g, '')).toBe(s.courses.PV079!.id.replace(/-/g, ''));
    expect(titleOf(byId('PV198:hw9'))).toBe('PV198 · HW09 – i2c');
    expect(byId('IA174:hw2').properties.Deadline.date.start).toContain('2026-11-11T23:59');

    // Backfill: past homework comes in as Done
    expect(byId('PV079:hw1').properties.Done.checkbox).toBe(true);
    expect(byId('IA174:hw1').properties.Done.checkbox).toBe(true);

    // Exams + notebooks
    const exams = s.notion.pages.filter(p => p.db === EXAMS_DB);
    expect(exams).toHaveLength(1);
    expect(exams[0]!.properties.Kind.select.name).toBe('pre-term');
    expect(textOf(s.courses.PV079!, 'Notebooks')).toContain('HW02_points: 4 pts');

    // Second run: nothing to do
    const before = s.notion.writes.length;
    const again = await run(s.env, 'real', s.fetcher, NOW);
    expect(again.actions).toEqual([]);
    expect(s.notion.writes.length).toBe(before);
  });

  it("never overwrites the user's own deadline or Done", async () => {
    const s = setup();
    await run(s.env, 'real', s.fetcher, NOW);
    const hw4 = s.notion.pages.find(p => textOf(p, 'IS ID') === 'PV079:hw4')!;
    // User moves the deadline earlier (own buffer) and unticks nothing.
    Object.assign(hw4.properties, s.notion.read({ Deadline: { date: { start: '2026-11-14T18:00:00' } } }));
    const log = await run(s.env, 'real', s.fetcher, NOW);
    expect(log.actions).toEqual([]);
    expect(hw4.properties.Deadline.date.start).toBe('2026-11-14T18:00:00.000+01:00');
  });

  it('reports a failed login clearly', async () => {
    const s = setup();
    const fetcher = (url: string, init: RequestInit) =>
      url.includes('islogin') && init.method === 'POST' ? Promise.resolve(new Response('<p>Incorrect password.</p>')) : s.fetcher(url, init);
    const log = await run(s.env, 'real', fetcher, NOW);
    expect(log.error).toMatch(/login failed.*Incorrect password/);
    expect(s.notion.writes).toEqual([]);
  });
});
