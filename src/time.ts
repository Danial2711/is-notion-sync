// Prague wall-clock helpers. Dates are plain 'YYYY-MM-DD' strings; instants are epoch ms.

export const TZ = 'Europe/Prague';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export interface Parts { y: number; m: number; d: number; hh: number; mm: number; ss: number }

export function pragueParts(ts: number): Parts {
  const p: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(new Date(ts))) p[type] = Number(value);
  return { y: p.year!, m: p.month!, d: p.day!, hh: p.hour!, mm: p.minute!, ss: p.second! };
}

/** Prague UTC offset in ms at instant ts (+3600000 in winter, +7200000 in summer). */
export function pragueOffset(ts: number): number {
  const p = pragueParts(ts);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ts / 1000) * 1000;
}

/** Instant of a Prague wall-clock time. */
export function pragueToUtc(date: string, hh = 0, mm = 0): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const first = naive - pragueOffset(naive);
  return naive - pragueOffset(first); // second pass settles DST edges
}

export function pragueDate(ts: number): string {
  const p = pragueParts(ts);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekdayName(i: number): string {
  return WEEKDAYS[i] ?? '?';
}

/** The next Prague midnight after ts, and its date. */
export function nextMidnight(ts: number): { ts: number; date: string } {
  const date = addDays(pragueDate(ts), 1);
  return { ts: pragueToUtc(date), date };
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export const pad = (n: number) => String(n).padStart(2, '0');

export function pretty(date: string): string {
  const [, m, d] = date.split('-');
  return `${weekdayName(weekdayOf(date))} ${d}.${m}.`;
}


/** Whole days from a to b (dates as YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const ms = (d: string) => { const [y, m, dd] = d.split('-').map(Number) as [number, number, number]; return Date.UTC(y, m - 1, dd); };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}
