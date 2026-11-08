// One sync run: read IS -> detect homework/exams/points -> plan Notion writes -> apply them.
// Notion is the source of truth for what exists (matched by the "IS ID" property);
// KV only remembers what this Worker itself wrote, so your own edits are never overwritten.
import { COURSES, IS, elPath, hwNumber } from './config';
import {
  type CourseData, type Exam, type Homework, detectExams, detectHomework, homeworkChapters, notebookSummary,
} from './detect';
import { Budget, BudgetError, type Fetcher } from './http';
import {
  type CourseNotebooks, type ExamDate, type ExamSeriesLink, IsClient,
  parseChapterDeadline, parseExamOverview, parseExamSeries, parseFmgr, parseNotebooks, parseSyllabus,
} from './is';
import { type NPage, Notion, P, type Props, R, dueKey } from './notion';
import { pragueParts, pad } from './time';

export interface Env {
  KV: KVNamespace;
  IS_UCO?: string;
  IS_PASSWORD?: string;
  NOTION_TOKEN?: string;
  RUN_PASSWORD?: string;
  NOTION_ASSIGNMENTS_DB: string;
  NOTION_COURSES_DB: string;
  NOTION_EXAMS_DB: string;
}

export interface State {
  written: Record<string, string>;  // homework id -> deadline this Worker last wrote
  doneSet: Record<string, 1>;       // homework ids this Worker ticked Done (never again)
}

export interface Action {
  kind: 'create' | 'update';
  target: 'assignments' | 'exams' | 'courses';
  pageId?: string;
  label: string;
  props: Props;
  priority: number;                 // lower runs first
  after?: (s: State) => void;
}

export interface RunLog {
  at: string;
  mode: 'dry' | 'real';
  ok: boolean;
  error?: string;
  warnings: string[];
  requests: number;
  found: { homework: number; exams: number };
  actions: { kind: string; label: string; status: 'planned' | 'done' | 'failed'; error?: string }[];
  pending: number;                  // left for the next run (subrequest budget)
}

const STATE_KEY = 'state';
export const LAST_RUN_KEY = 'lastRun';

export function nowPrague(ts = Date.now()) {
  const p = pragueParts(ts);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:${pad(p.mm)}` };
}

// ---- 1. read IS ----------------------------------------------------------------------

export interface Gathered { courses: CourseData[]; notebooks: CourseNotebooks[]; exams: Exam[] }

export async function gather(is: IsClient, today: string, warn: (s: string) => void): Promise<Gathered> {
  const en = (p: string) => `${p}${p.includes('?') ? ';' : '?'}lang=en`;
  const listing = async (code: string, sub: string) => parseFmgr(await is.page(en(elPath(code, sub))), elPath(code, sub));
  const soft = async <T>(what: string, f: () => Promise<T>): Promise<T | undefined> => {
    try { return await f(); } catch (e) {
      if (e instanceof BudgetError) throw e;
      warn(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };

  const courses: CourseData[] = [];
  for (const cfg of COURSES) {
    const d: CourseData = { cfg };
    if (cfg.vaults) d.vaults = await soft(`${cfg.code} vaults`, () => listing(cfg.code, 'ode/'));
    if (cfg.hwFolder) d.hwFolder = await soft(`${cfg.code} ${cfg.hwFolder}`, () => listing(cfg.code, cfg.hwFolder!));
    if (cfg.weekly) d.weekly = await soft(`${cfg.code} um/`, () => listing(cfg.code, 'um/'));
    if (cfg.syllabus) {
      const syl = elPath(cfg.code, 'index.qwarp');
      const chapters = await soft(`${cfg.code} syllabus`, async () => homeworkChapters(parseSyllabus(await is.page(en(syl))), today));
      d.chapters = [];
      for (const chapter of chapters ?? []) {
        const due = await soft(`${cfg.code} ${chapter.title}`, async () => parseChapterDeadline(await is.page(en(`${syl}?prejit=${chapter.id}`))));
        d.chapters.push({ chapter, due: due ?? null });
      }
    }
    courses.push(d);
  }

  const notebooks = await soft('notebooks', async () => parseNotebooks(await is.page(en('/auth/student/poznamkove_bloky_nahled.pl')))) ?? [];

  const series: { link: ExamSeriesLink; dates: ExamDate[] }[] = [];
  const overview = await soft('exams', async () => parseExamOverview(await is.page(en('/auth/student/prihl_na_zkousky.pl')))) ?? [];
  for (const link of overview.filter(l => COURSES.some(c => c.code === l.code))) {
    const href = new URL(link.href, `${IS}/auth/student/`).toString();
    const dates = await soft(`exams ${link.code}`, async () => parseExamSeries(await is.page(href)));
    if (dates) series.push({ link: { ...link, href }, dates });
  }
  return { courses, notebooks, exams: detectExams(series, today) };
}

// ---- 2. plan Notion writes -----------------------------------------------------------------

export interface NotionData { assignments: NPage[]; courses: NPage[]; exams: NPage[] }

const norm = (id: string) => id.replace(/-/g, '');

export function plan(hw: Homework[], exams: Exam[], notebooks: CourseNotebooks[], n: NotionData, state: State, warn: (s: string) => void): Action[] {
  const actions: Action[] = [];
  const courseByCode = new Map<string, NPage>();
  for (const c of n.courses) {
    const code = R.text(c, 'Course Code').trim().toUpperCase();
    if (code) courseByCode.set(code, c);
  }
  const courseId = (code: string) => { const p = courseByCode.get(code); return p ? norm(p.id) : undefined; };

  // -- assignments
  const byIsId = new Map<string, NPage>();
  const unclaimed = new Set<NPage>();
  for (const p of n.assignments) {
    const id = R.text(p, 'IS ID').trim();
    if (id) byIsId.set(id, p); else unclaimed.add(p);
  }
  for (const h of hw) {
    const cid = courseId(h.course);
    if (!cid) warn(`no Notion course with Course Code ${h.course}`);
    let page = byIsId.get(h.id);
    if (!page && cid) {
      // Adopt a hand-made entry: same course, same homework number in its title.
      const num = Number(h.id.split(':hw')[1]);
      const cands = [...unclaimed].filter(p => R.relation(p, 'Courses').includes(cid) && hwNumber(R.title(p)) === num);
      if (cands.length === 1) { page = cands[0]!; unclaimed.delete(page); }
    }
    const due = h.due ? dueKey(h.due) : undefined;
    const graded = h.points !== undefined;
    const priority = h.past ? 3 : 0;

    if (!page) {
      const done = h.past || graded;
      actions.push({
        kind: 'create', target: 'assignments', priority, label: `${h.title}${due ? ` (due ${due.replace('T', ' ')})` : ''}${done ? ' [done]' : ''}`,
        props: {
          'Assignment Name': P.title(h.title),
          'IS ID': P.text(h.id),
          Source: P.select(h.source),
          Done: P.check(done),
          ...(cid ? { Courses: P.relation([cid]) } : {}),
          ...(h.due ? { Deadline: P.date(h.due) } : {}),
          ...(h.submitLink ? { 'Submission Link': P.url(h.submitLink) } : {}),
          ...(h.link ? { URL: P.url(h.link) } : {}),
          ...(graded ? { Points: P.text(String(h.points)) } : {}),
        },
        after: s => { if (due) s.written[h.id] = due; if (done) s.doneSet[h.id] = 1; },
      });
      continue;
    }

    const props: Props = {};
    const notes: string[] = [];
    if (R.text(page, 'IS ID') !== h.id) { props['IS ID'] = P.text(h.id); notes.push('linked'); }
    if (!R.select(page, 'Source')) props.Source = P.select(h.source);
    if (cid && !R.relation(page, 'Courses').length) props.Courses = P.relation([cid]);
    if (h.submitLink && !R.url(page, 'Submission Link')) props['Submission Link'] = P.url(h.submitLink);
    if (h.link && !R.url(page, 'URL')) props.URL = P.url(h.link);
    let wroteDue: string | undefined;
    if (h.due && due) {
      const cur = R.date(page, 'Deadline');
      // Fill an empty deadline, or follow IS when the current one is still what we wrote.
      if (!cur || (cur === state.written[h.id] && cur !== due)) { props.Deadline = P.date(h.due); wroteDue = due; notes.push(`due ${due.replace('T', ' ')}`); }
    }
    if (graded && R.text(page, 'Points') !== String(h.points)) { props.Points = P.text(String(h.points)); notes.push(`${h.points} pts`); }
    let tick = false;
    if (graded && !R.check(page, 'Done') && !state.doneSet[h.id]) { props.Done = P.check(true); tick = true; notes.push('done'); }
    if (Object.keys(props).length) {
      actions.push({
        kind: 'update', target: 'assignments', pageId: page.id, priority: priority + 1,
        label: `${R.title(page) || h.title}: ${notes.join(', ') || 'links'}`, props,
        after: s => { if (wroteDue) s.written[h.id] = wroteDue; if (tick) s.doneSet[h.id] = 1; },
      });
    }
  }

  // -- exams
  const examById = new Map(n.exams.map(p => [R.text(p, 'IS ID'), p] as const));
  for (const e of exams) {
    const cid = courseId(e.course);
    const page = examById.get(e.id);
    const when = `${e.start.date} ${e.start.time}`;
    if (!page) {
      actions.push({
        kind: 'create', target: 'exams', priority: 2, label: `${e.name} ${when}`,
        props: {
          Name: P.title(`${e.name} – ${when}`), 'IS ID': P.text(e.id), Date: P.date(e.start), Room: P.text(e.room),
          Kind: P.select(e.kind), Registered: P.check(e.registered), 'IS link': P.url(e.link),
          ...(cid ? { Course: P.relation([cid]) } : {}),
        },
      });
    } else {
      const props: Props = {};
      if (R.check(page, 'Registered') !== e.registered) props.Registered = P.check(e.registered);
      if (e.room && R.text(page, 'Room') !== e.room) props.Room = P.text(e.room);
      if (Object.keys(props).length) actions.push({ kind: 'update', target: 'exams', pageId: page.id, priority: 2, label: `${e.name} ${when}: ${e.registered ? 'registered' : 'not registered'}`, props });
    }
  }

  // -- course notebooks summary
  for (const nb of notebooks) {
    const page = courseByCode.get(nb.code);
    if (!page) continue;
    const summary = notebookSummary(nb);
    if (summary && R.text(page, 'Notebooks') !== summary) {
      actions.push({ kind: 'update', target: 'courses', pageId: page.id, priority: 2, label: `${nb.code} notebooks`, props: { Notebooks: P.text(summary) } });
    }
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

// ---- 3. run -------------------------------------------------------------------------------------

export async function run(env: Env, mode: 'dry' | 'real', fetcher?: Fetcher, now = Date.now()): Promise<RunLog> {
  const budget = new Budget(48);
  const log: RunLog = { at: new Date(now).toISOString(), mode, ok: false, warnings: [], requests: 0, found: { homework: 0, exams: 0 }, actions: [], pending: 0 };
  const warn = (s: string) => { log.warnings.push(s); };
  try {
    const uco = need(env.IS_UCO, 'IS_UCO'), pw = need(env.IS_PASSWORD, 'IS_PASSWORD'), token = need(env.NOTION_TOKEN, 'NOTION_TOKEN');
    const today = nowPrague(now);
    const is = new IsClient(budget, fetcher);
    await is.login(uco, pw);
    const g = await gather(is, today.date, warn);
    const hw = detectHomework(g.courses, g.notebooks, today);
    log.found = { homework: hw.length, exams: g.exams.length };

    const notion = new Notion(token, budget, fetcher);
    const data: NotionData = {
      courses: await notion.queryAll(env.NOTION_COURSES_DB),
      assignments: await notion.queryAll(env.NOTION_ASSIGNMENTS_DB),
      exams: await notion.queryAll(env.NOTION_EXAMS_DB),
    };
    const state = await loadState(env.KV);
    const actions = plan(hw, g.exams, g.notebooks, data, state, warn);

    for (const [i, a] of actions.entries()) {
      if (mode === 'dry') { log.actions.push({ kind: a.kind, label: a.label, status: 'planned' }); continue; }
      if (budget.remaining < 1) { log.pending = actions.length - i; break; }
      try {
        if (a.kind === 'create') await notion.create(dbOf(env, a.target), a.props);
        else await notion.update(a.pageId!, a.props);
        a.after?.(state);
        log.actions.push({ kind: a.kind, label: a.label, status: 'done' });
      } catch (e) {
        if (e instanceof BudgetError) { log.pending = actions.length - i; break; }
        log.actions.push({ kind: a.kind, label: a.label, status: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (mode === 'real') await env.KV.put(STATE_KEY, JSON.stringify(state));
    log.ok = !log.actions.some(a => a.status === 'failed');
  } catch (e) {
    log.error = e instanceof Error ? e.message : String(e);
  }
  log.requests = budget.used;
  return log;
}

const dbOf = (env: Env, t: Action['target']) =>
  t === 'assignments' ? env.NOTION_ASSIGNMENTS_DB : t === 'exams' ? env.NOTION_EXAMS_DB : env.NOTION_COURSES_DB;

async function loadState(kv: KVNamespace): Promise<State> {
  const s = await kv.get<Partial<State>>(STATE_KEY, 'json');
  return { written: s?.written ?? {}, doneSet: s?.doneSet ?? {} };
}

function need(v: string | undefined, name: string): string {
  if (!v) throw new Error(`secret ${name} is not set (npx wrangler secret put ${name})`);
  return v;
}
