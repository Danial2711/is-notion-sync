// What to watch in IS, per course. Mapped in docs/SITE.md (Autumn 2026).

export const IS = 'https://is.muni.cz';
export const FACULTY = 'fi';
export const TERM = 'podzim2026';

export interface CourseCfg {
  code: string;
  /** Homework Vaults (ode/): each vault is a homework; its insert right's end is the deadline. */
  vaults?: boolean;
  /** Materials folder where assignment texts appear (often before the vault). */
  hwFolder?: string;
  /** Interactive syllabus chapters named "Homework N" (deadline in the chapter text). */
  syllabus?: boolean;
  /** A numbered weekly folder in um/ (e.g. "09_i2c") per seminar; due before the next seminar. */
  weekly?: { weekday: number; time: string }; // 0 = Monday
}

export const COURSES: CourseCfg[] = [
  { code: 'IA174', syllabus: true },
  { code: 'IV111' },
  { code: 'PA191', vaults: true, hwFolder: 'um/homeworks/' },
  { code: 'PV079', vaults: true, hwFolder: 'um/assignments/' },
  { code: 'PV181', vaults: true },
  { code: 'PV198', weekly: { weekday: 1, time: '12:00' } }, // seminar PV198/05, Tue 12:00
  { code: 'VV066' },
];

export const elPath = (code: string, sub = '') => `/auth/el/${FACULTY}/${TERM}/${code}/${sub}`;

/**
 * Homework number from a name: "HW04_Side_channel", "assignment_4", "assignment3.zip",
 * "Homework 01", "HW02_points" all work. "HW SUM" and "Non-graded Homework" give null.
 */
export function hwNumber(name: string): number | null {
  const m = name.match(/(?:^|[^a-z])(?:hw|homework|assignment|[uú]kol|du)[\s_\-.]*0*(\d{1,2})(?!\d)/i);
  return m ? Number(m[1]) : null;
}

export const hwId = (code: string, n: number | string) => `${code}:hw${n}`;
