import { hwNumber } from './config';
import { detectExams, detectHomework, examKind, homeworkChapters, notebookSummary, weeklyDue } from './detect';
import * as F from './fixtures';
import { parseChapterDeadline, parseExamOverview, parseExamSeries, parseFmgr, parseNotebooks, parseSyllabus } from './is';

describe('hwNumber', () => {
  it.each([
    ['HW04_Side_channel', 4], ['assignment_4', 4], ['assignment3.zip', 3], ['assignment3_-_comments.pdf', 3],
    ['Homework 01', 1], ['HW02_points', 2], ['HW01_RNG_points', 1], ['HW07', 7], ['Homework 2, BGP', 2],
    ['Assignment 2, Exploring colisions in Keccak', 2], ['Homework 04, Interrupts', 4],
    ['HW SUM', null], ['Non-graded Homework', null], ['prezence 02', null], ['Preparation_Seminar6', null],
  ])('%s -> %s', (name, n) => expect(hwNumber(name)).toBe(n));
});

describe('file manager JSON', () => {
  it('reads vaults with deadlines from the insert right', () => {
    const v = parseFmgr(F.PV079_ODE, '/auth/el/fi/podzim2026/PV079/ode/');
    expect(v).toHaveLength(3);
    const hw4 = v.find(x => x.name === 'HW04_Side_channel')!;
    expect(hw4).toMatchObject({ isVault: true, created: '2026-11-06', writeUntil: { date: '2026-11-15', time: '23:59' } });
    expect(v.find(x => x.name === 'HW01_RNG')!.writeUntil).toBeUndefined();
  });

  it('names files by their path segment', () => {
    const f = parseFmgr(F.PV079_ASSIGNMENTS, '/auth/el/fi/podzim2026/PV079/um/assignments/');
    expect(f.map(x => x.name).sort()).toEqual(['HW01_Comments.pdf', 'assignment1.zip', 'assignment_4', 'assignment_5']);
  });

  it('throws when the page has no listing data', () => {
    expect(() => parseFmgr('<html></html>', '/auth/el/x/')).toThrow(/no file listing/);
  });
});

describe('syllabus', () => {
  it('finds chapters, publication state and study dates', () => {
    const ch = parseSyllabus(F.IA174_SYLLABUS);
    expect(ch.map(c => c.title)).toEqual(['Lecture 1 - Symmetric ciphers', 'Homework 1', 'Homework 2', 'Homework 3']);
    expect(ch[2]).toMatchObject({ id: '9620916', published: true, from: '2026-10-27', to: '2026-11-11' });
    expect(ch[3]).toMatchObject({ published: false, to: '2025-12-16' });
    expect(homeworkChapters(ch, '2026-11-08').map(c => c.title)).toEqual(['Homework 1', 'Homework 2']);
  });

  it('takes the date from the vault and the time from the text', () => {
    expect(parseChapterDeadline(F.IA174_HW2)).toEqual({ date: '2026-11-11', time: '23:59' });
    expect(parseChapterDeadline('<p>no vault here</p>')).toBeNull();
  });
});

describe('notebooks', () => {
  it('parses courses, notebook names and scores', () => {
    const nb = parseNotebooks(F.NOTEBOOKS);
    expect(nb.map(c => c.code)).toEqual(['PA191', 'PV079', 'PV198']);
    expect(nb[0]!.notebooks[0]).toMatchObject({ name: 'HW03_SDN', points: 3 });
    expect(nb[1]!.notebooks.map(n => n.points)).toEqual([4, 3.5]);
    expect(notebookSummary(nb[2]!)).toBe('HW SUM: 7 pts\nHW04: 1 pts\nprezence 05: 2 attended');
  });
});

describe('exams', () => {
  it('lists series and skips reservation-window dates', () => {
    const o = parseExamOverview(F.EXAM_OVERVIEW);
    expect(o).toEqual([expect.objectContaining({ code: 'PA191', serie: '207460', label: 'PA191 Advanced Computer Networking - pre-term exam' })]);
    expect(parseExamSeries(F.EXAM_SERIES)).toEqual([{ start: { date: '2026-12-16', time: '08:00' }, room: 'A318', registered: false }]);
    expect(examKind(o[0]!.label)).toBe('pre-term');
  });

  it('drops exam dates that are already over', () => {
    const link = parseExamOverview(F.EXAM_OVERVIEW)[0]!;
    const dates = parseExamSeries(F.EXAM_SERIES);
    expect(detectExams([{ link, dates }], '2026-11-08')).toHaveLength(1);
    expect(detectExams([{ link, dates }], '2026-12-17')).toHaveLength(0);
  });
});

describe('detectHomework', () => {
  const now = { date: '2026-11-08', time: '12:00' };
  const courses = [
    { cfg: { code: 'PV079', vaults: true, hwFolder: 'um/assignments/' },
      vaults: parseFmgr(F.PV079_ODE, '/auth/el/fi/podzim2026/PV079/ode/'),
      hwFolder: parseFmgr(F.PV079_ASSIGNMENTS, '/auth/el/fi/podzim2026/PV079/um/assignments/') },
    { cfg: { code: 'PV198', weekly: { weekday: 1, time: '12:00' } }, weekly: parseFmgr(F.PV198_UM, '/auth/el/fi/podzim2026/PV198/um/') },
    { cfg: { code: 'IA174', syllabus: true }, chapters: [
      { chapter: parseSyllabus(F.IA174_SYLLABUS)[1]!, due: parseChapterDeadline(F.IA174_HW1) },
      { chapter: parseSyllabus(F.IA174_SYLLABUS)[2]!, due: parseChapterDeadline(F.IA174_HW2) },
    ] },
  ];
  const hw = detectHomework(courses, parseNotebooks(F.NOTEBOOKS), now);
  const get = (id: string) => hw.find(h => h.id === id);

  it('merges vault + materials into one homework per number', () => {
    expect(hw.filter(h => h.course === 'PV079').map(h => h.id).sort()).toEqual(['PV079:hw1', 'PV079:hw2', 'PV079:hw4', 'PV079:hw5']);
    expect(get('PV079:hw4')).toMatchObject({ title: 'PV079 · HW04 Side channel', source: 'IS vault', due: { date: '2026-11-15', time: '23:59' }, past: false });
    expect(get('PV079:hw4')!.link).toContain('/um/assignments/assignment_4/');
    expect(get('PV079:hw1')).toMatchObject({ past: true, points: 3.5 });   // closed vault, graded
    expect(get('PV079:hw5')).toMatchObject({ source: 'IS materials', past: false }); // text out, no vault yet
    expect(get('PV079:hw5')!.due).toBeUndefined();
  });

  it('gives PV198 weekly folders a due date one week after their seminar', () => {
    expect(get('PV198:hw4')).toMatchObject({ due: { date: '2026-10-13', time: '12:00' }, past: true });
    expect(get('PV198:hw9')).toMatchObject({ title: 'PV198 · HW09 – i2c', due: { date: '2026-11-17', time: '12:00' }, past: false });
    expect(get('PV198:hw0')).toBeUndefined();
    expect(weeklyDue('2026-11-03', { weekday: 1, time: '12:00' })).toEqual({ date: '2026-11-10', time: '12:00' }); // posted on seminar day
  });

  it('reads IA174 homework from the syllabus', () => {
    expect(get('IA174:hw2')).toMatchObject({ source: 'IS syllabus', due: { date: '2026-11-11', time: '23:59' }, past: false });
    expect(get('IA174:hw1')).toMatchObject({ due: { date: '2026-10-21', time: '23:59' }, past: true });
  });
});
