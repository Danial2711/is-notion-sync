// Turns parsed IS data into homework and exam records with stable IDs.
// One homework = one ID per course and number ("PV079:hw4"), whichever place it was seen in
// (vault, materials folder, syllabus, notebook), so all sources land on the same Notion page.
import { type CourseCfg, IS, elPath, hwId, hwNumber } from './config';
import type { Chapter, CourseNotebooks, Due, ExamDate, ExamSeriesLink, FmgrNode } from './is';
import { addDays, weekdayOf } from './time';

export type Source = 'IS vault' | 'IS materials' | 'IS syllabus';

export interface Homework {
  id: string;
  course: string;
  title: string;
  source: Source;
  due?: Due;
  /** Already over: closed vault or deadline in the past. Used only when creating the page. */
  past: boolean;
  submitLink?: string;
  link?: string;           // assignment text / folder
  points?: number;         // from the notebook, once graded
}

export interface CourseData {
  cfg: CourseCfg;
  vaults?: FmgrNode[];
  hwFolder?: FmgrNode[];
  weekly?: FmgrNode[];
  chapters?: { chapter: Chapter; due: Due | null }[];
}

const pretty = (s: string) => s.replace(/\.[a-z0-9]{1,4}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
const url = (path: string) => `${IS}/auth${path}`;
const isPast = (due: Due | undefined, now: { date: string; time: string }) =>
  !!due && (due.date < now.date || (due.date === now.date && due.time <= now.time));

export function detectHomework(data: CourseData[], notebooks: CourseNotebooks[], now: { date: string; time: string }): Homework[] {
  const byId = new Map<string, Homework>();
  const put = (h: Homework) => {
    const old = byId.get(h.id);
    if (!old) { byId.set(h.id, h); return; }
    // Merge: the vault wins for title, deadline and open/closed; other sources fill gaps.
    const [main, other] = h.source === 'IS vault' && old.source !== 'IS vault' ? [h, old] : [old, h];
    byId.set(h.id, {
      ...main,
      due: main.due ?? other.due,
      past: main.source === 'IS vault' || main.due ? main.past : other.past,
      submitLink: main.submitLink ?? other.submitLink,
      link: main.link ?? other.link,
    });
  };

  for (const { cfg, vaults, hwFolder, weekly, chapters } of data) {
    const code = cfg.code;
    for (const v of vaults ?? []) {
      if (!v.isVault) continue;
      const n = hwNumber(v.name);
      if (n === null) continue;
      put({
        id: hwId(code, n), course: code, title: `${code} · ${pretty(v.name)}`, source: 'IS vault',
        due: v.writeUntil, past: !v.writeUntil || isPast(v.writeUntil, now), submitLink: url(v.path),
      });
    }
    for (const f of hwFolder ?? []) {
      const n = hwNumber(f.name);
      if (n === null) continue;
      put({
        id: hwId(code, n), course: code, title: `${code} · ${pretty(f.name)}`, source: 'IS materials',
        past: false, link: url(f.isDir ? f.path : f.path.replace(/[^/]+$/, '')),
      });
    }
    for (const f of weekly ?? []) {
      const m = f.name.match(/^(\d{1,2})[_ -]+(.+)$/);
      if (!m || !f.isDir || Number(m[1]) === 0 || !f.created || !cfg.weekly) continue;
      const due = weeklyDue(f.created, cfg.weekly);
      put({
        id: hwId(code, Number(m[1])), course: code, title: `${code} · HW${m[1]!.padStart(2, '0')} – ${pretty(m[2]!)}`,
        source: 'IS materials', due, past: isPast(due, now), link: url(f.path),
      });
    }
    for (const { chapter, due } of chapters ?? []) {
      const n = hwNumber(chapter.title);
      const bonus = /bonus/i.test(chapter.title);
      if (n === null && !bonus) continue;
      put({
        id: hwId(code, n ?? 'bonus'), course: code, title: `${code} · ${chapter.title}`, source: 'IS syllabus',
        due: due ?? undefined, past: isPast(due ?? undefined, now) || (!due && !!chapter.to && chapter.to < now.date),
        link: `${IS}${elPath(code, 'index.qwarp')}?prejit=${chapter.id}`,
      });
    }
  }

  // Points from notebooks ("HW03_SDN", "HW02_points", "Homework 01", "HW07").
  for (const { code, notebooks: nbs } of notebooks) {
    for (const nb of nbs) {
      const n = hwNumber(nb.name);
      const h = n === null ? undefined : byId.get(hwId(code, n));
      if (h && nb.points !== null) h.points = nb.points;
    }
  }
  return [...byId.values()];
}

/** PV198-style: the folder belongs to the first seminar on/after its upload; due one week later. */
export function weeklyDue(created: string, w: { weekday: number; time: string }): Due {
  const shift = (w.weekday - weekdayOf(created) + 7) % 7;
  return { date: addDays(created, shift + 7), time: w.time };
}

/** Published syllabus chapters that look like homework (the only ones worth opening). */
export function homeworkChapters(chapters: Chapter[], today: string): Chapter[] {
  const yearAgo = addDays(today, -200);
  return chapters.filter(c => c.published && (hwNumber(c.title) !== null || /bonus/i.test(c.title)) && (!c.to || c.to >= yearAgo));
}

// ---- exams -------------------------------------------------------------------------------

export interface Exam {
  id: string; course: string; name: string; start: Due; room: string;
  kind: 'pre-term' | 'regular' | 'resit' | 'midterm' | 'colloquium';
  registered: boolean; link: string;
}

export function detectExams(series: { link: ExamSeriesLink; dates: ExamDate[] }[], today: string): Exam[] {
  return series.flatMap(({ link, dates }) => dates.filter(d => d.start.date >= today).map(d => ({
    id: `exam:${link.serie}:${d.start.date}T${d.start.time}`,
    course: link.code,
    name: link.label,
    start: d.start, room: d.room, registered: d.registered,
    kind: examKind(link.label),
    link: link.href, // absolute (resolved when fetched)
  })));
}

export function examKind(label: string): Exam['kind'] {
  if (/pre-?term|předterm/i.test(label)) return 'pre-term';
  if (/resit|opravn/i.test(label)) return 'resit';
  if (/mid-?term|průběž|vnitrosem/i.test(label)) return 'midterm';
  if (/colloq|kolokv/i.test(label)) return 'colloquium';
  return 'regular';
}

/** Short per-course notebook summary for the Courses "Notebooks" property. */
export function notebookSummary(nb: CourseNotebooks): string {
  return nb.notebooks.map(n => {
    if (/^prezence|attendance/i.test(n.name)) return `${n.name}: ${n.content.filter(l => /presence|přítom/i.test(l)).length} attended`;
    return n.points !== null ? `${n.name}: ${n.points} pts` : `${n.name}: ${n.content.join(' ').slice(0, 80)}`;
  }).join('\n').slice(0, 1900);
}
