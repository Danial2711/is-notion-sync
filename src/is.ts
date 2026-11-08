// IS MU: login and page parsers. Page shapes are documented in docs/SITE.md.
import { IS } from './config';
import { type Budget, type Fetcher, HttpError, Session } from './http';
import { decode, lines, text } from './html';

export class IsError extends HttpError {}

export interface Due { date: string; time: string } // Prague wall clock: YYYY-MM-DD, HH:MM

// ---- client -----------------------------------------------------------------

export class IsClient {
  readonly http: Session;
  constructor(budget: Budget, fetcher?: Fetcher) { this.http = new Session(budget, fetcher); }

  /** IS's own login form on muni.islogin.cz: credential_0 = UČO, credential_1 = password. */
  async login(uco: string, password: string): Promise<void> {
    const start = await this.http.req(`${IS}/auth/?lang=en`);
    if (isInside(start.url)) return; // already logged in
    if (!/islogin\.cz/.test(start.url) || !/name="credential_0"/.test(start.html)) {
      throw new IsError(`unexpected login page at ${host(start.url)} (HTTP ${start.status})`);
    }
    const action = start.html.match(/<form\b[^>]*\baction="([^"]*)"[^>]*islogin_form|<form\b[^>]*islogin_form[^>]*\baction="([^"]*)"/);
    const target = new URL(decode(action?.[1] ?? action?.[2] ?? ''), start.url).toString();
    const r = await this.http.req(target, { method: 'POST', form: { credential_0: uco, credential_1: password, uloz: 'uloz' } });
    if (!isInside(r.url)) {
      const hint = text(r.html).match(/(incorrect|wrong|invalid|nesprávn|chybn|two-factor|dvoufázov|ověřen)[^.]{0,80}/i)?.[0];
      throw new IsError(`login failed, ended at ${host(r.url)}${hint ? `: "${hint}"` : ''}`);
    }
  }

  /** GET an /auth/ page; throws if the session bounced back to the login page. */
  async page(path: string): Promise<string> {
    const r = await this.http.req(path.startsWith('http') ? path : IS + path);
    if (!isInside(r.url)) throw new IsError(`session lost while opening ${path}`);
    if (r.status !== 200) throw new IsError(`HTTP ${r.status} for ${path}`);
    return r.html;
  }
}

const host = (u: string) => new URL(u).hostname;
const isInside = (u: string) => u.startsWith(`${IS}/auth`);

// ---- file manager listings (window.fmgrUzly JSON) ------------------------------

export interface FmgrNode {
  path: string;          // "/el/fi/podzim2026/PV079/ode/207161201/"
  name: string;
  created: string;       // ISO date YYYY-MM-DD (Prague)
  isDir: boolean;
  isVault: boolean;
  writeUntil?: Due;      // open vault: end of the students' insert right
}

interface RawNode {
  nazev?: string; timestamp?: string; slozka?: unknown; je_to_odevzdavarna?: unknown;
  prava?: { w?: Record<string, { datum?: string }> };
}

/** Children of the listed folder, from the JSON every file-manager page embeds. */
export function parseFmgr(html: string, listedPath: string): FmgrNode[] {
  const raw = extractFmgr(html);
  if (!raw) throw new IsError(`no file listing data on ${listedPath}`);
  const self = listedPath.replace(/^\/auth/, '');
  const out: FmgrNode[] = [];
  for (const [path, n] of Object.entries(raw)) {
    if (path === self || !path.startsWith(self)) continue;
    const seg = decodeURIComponent(path.slice(self.length).replace(/\/$/, ''));
    if (!seg || seg.includes('/')) continue; // direct children only
    const ts = n.timestamp ?? '';
    const ends = Object.values(n.prava?.w ?? {}).map(w => w.datum ?? '').filter(d => /^\d{12}$/.test(d)).sort();
    const end = ends.at(-1);
    out.push({
      path,
      name: (n.nazev ?? seg).trim(),
      created: ts.length >= 8 ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : '',
      isDir: Boolean(n.slozka) || path.endsWith('/'),
      isVault: Boolean(n.je_to_odevzdavarna) && path.endsWith('/'),
      writeUntil: end ? { date: `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`, time: `${end.slice(8, 10)}:${end.slice(10, 12)}` } : undefined,
    });
  }
  return out;
}

function extractFmgr(html: string): Record<string, RawNode> | null {
  const at = html.indexOf('window.fmgrUzly');
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  const stop = html.indexOf('</script>', start);
  // The object ends at some "};" before </script>; try each candidate until JSON.parse accepts one.
  for (let i = html.indexOf('};', start); i >= 0 && (stop < 0 || i < stop); i = html.indexOf('};', i + 1)) {
    try { return JSON.parse(html.slice(start, i + 1)) as Record<string, RawNode>; } catch { /* keep looking */ }
  }
  return null;
}

// ---- interactive syllabus -------------------------------------------------------

export interface Chapter { id: string; title: string; published: boolean; from?: string; to?: string }

export function parseSyllabus(html: string): Chapter[] {
  const out = new Map<string, Chapter>();
  const parts = html.split('data-prvek_ekvivalence_id="');
  for (const part of parts.slice(1)) {
    const id = part.match(/^(\d+)"/)?.[1];
    if (!id || out.has(id) || !/^[^>]*io-kapitola-box/.test(part)) continue;
    const title = text(part.match(/class="io-kapitola-nazev"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '');
    const study = text(part).match(/study (?:now )?(?:- )?from (\d{1,2})\/(\d{1,2})\/(\d{4}) to (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    out.set(id, {
      id, title,
      published: /io-kapitola-obsahuje/.test(part),
      from: study ? ymd(study[3]!, study[2]!, study[1]!) : undefined,
      to: study ? ymd(study[6]!, study[5]!, study[4]!) : undefined,
    });
  }
  return [...out.values()];
}

/** Deadline from a syllabus chapter page: "Submit until: 11/11/2026" plus a time stated near "deadline". */
export function parseChapterDeadline(html: string): Due | null {
  const t = text(html);
  const until = t.match(/Submit until:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (!until) return null;
  let time = until[4] ? `${until[4].padStart(2, '0')}:${until[5]}` : '';
  if (!time || time === '00:00') {
    const stated = t.match(/deadline[\s\S]{0,160}?(\d{1,2}):(\d{2})/i);
    time = stated ? `${stated[1]!.padStart(2, '0')}:${stated[2]}` : '23:59';
  }
  return { date: ymd(until[3]!, until[2]!, until[1]!), time };
}

// ---- notebooks --------------------------------------------------------------------

export interface Notebook { name: string; content: string[]; points: number | null }
export interface CourseNotebooks { code: string; notebooks: Notebook[] }

export function parseNotebooks(html: string): CourseNotebooks[] {
  const out: CourseNotebooks[] = [];
  const starts = [...html.matchAll(/<li\b[^>]*\bid="predmet_\d+"[^>]*>/g)].map(m => m.index!);
  starts.forEach((s, i) => {
    const block = html.slice(s, starts[i + 1] ?? html.length);
    const head = text(block.match(/class="accordion-title[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '');
    const code = head.match(/^[A-Z]{1,4}\d{3,4}/)?.[0];
    if (!code) return;
    const notebooks: Notebook[] = [];
    for (const pol of block.split(/class="ipb-pol\b/).slice(1)) {
      const name = text(pol.match(/class="[^"]*ipb-nazev[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '');
      const raw = pol.match(/class="overflow"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
      const content = lines(raw);
      if (name) notebooks.push({ name, content, points: points(content) });
    }
    out.push({ code, notebooks });
  });
  return out;
}

/** Sum of "*N" scores; null when the notebook has none. */
export function points(content: string[]): number | null {
  const nums = [...content.join('\n').matchAll(/\*\s?(-?\d+(?:[.,]\d+)?)/g)].map(m => Number(m[1]!.replace(',', '.')));
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

// ---- exams ----------------------------------------------------------------------------

export interface ExamSeriesLink { href: string; label: string; code: string; serie: string }
export interface ExamDate { start: Due; room: string; registered: boolean }

export function parseExamOverview(html: string): ExamSeriesLink[] {
  // Only the "upcoming" part: links below "courses no upcoming examination dates have been posted for"
  // lead to expired dates (and to non-exam series such as "přihlašování k výuce").
  const cut = html.search(/no upcoming examination dates|nebyly vypsány žádné/i);
  const upcoming = cut >= 0 ? html.slice(0, cut) : html;
  const out: ExamSeriesLink[] = [];
  // This page is old-style HTML with upper-case tags (<A HREF="...">), hence the i flag.
  for (const m of upcoming.matchAll(/<a\b[^>]*href="([^"]*prihl_na_zkousky[^"]*serie=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = text(m[3]!);
    const code = label.match(/^[A-Z]{1,4}\d{3,4}/)?.[0];
    if (!code || /přihlašování k výuce|registration for (teaching|classes)/i.test(label)) continue;
    if (!out.some(o => o.serie === m[2])) out.push({ href: decode(m[1]!), label, code, serie: m[2]! });
  }
  return out;
}

const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Po|Út|St|Čt|Pá|So|Ne)';

export function parseExamSeries(html: string): ExamDate[] {
  const t = text(html);
  const re = new RegExp(`(from |to |od |do )?${DAY} (\\d{1,2})\\. ?(\\d{1,2})\\. ?(\\d{4}) (\\d{1,2}):(\\d{2})\\s+([A-Z]?[A-Za-z]*\\d+[A-Za-z0-9.]*)?`, 'g');
  const out: ExamDate[] = [];
  let prev = 0;
  for (const m of t.matchAll(re)) {
    if (m[1]) continue; // a reservation window ("open ... from Wed 9. 12."), not an exam
    const before = t.slice(prev, m.index);
    prev = m.index! + m[0].length;
    out.push({
      start: { date: ymd(m[4]!, m[3]!, m[2]!), time: `${m[5]!.padStart(2, '0')}:${m[6]}` },
      room: m[7] ?? '',
      registered: !/no slot reserved|nemáte rezerv/i.test(before) && /slot reserved|rezervováno/i.test(before),
    });
  }
  return out;
}

// ---- utils ------------------------------------------------------------------------------

export const ymd = (y: string, m: string, d: string) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
