// Minimal Notion REST client (API version 2022-06-28, single-source databases).
import type { Budget, Fetcher } from './http';
import { HttpError } from './http';
import type { Due } from './is';
import { pad, pragueParts } from './time';

export class NotionError extends HttpError {}

export interface NPage { id: string; properties: Record<string, NProp> }
type RichText = { plain_text: string }[];
export interface NProp {
  type: string;
  title?: RichText; rich_text?: RichText; url?: string | null; checkbox?: boolean;
  select?: { name: string } | null; date?: { start: string } | null; relation?: { id: string }[];
}

export class Notion {
  constructor(private token: string, private budget: Budget, private fetcher: Fetcher = (i, init) => fetch(i, init)) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.budget.take();
    const res = await this.fetcher(`https://api.notion.com/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, 'notion-version': '2022-06-28', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as { message?: string; code?: string };
    if (!res.ok) {
      const hint = res.status === 404 ? ' (is the database shared with the "IS Sync" integration?)' : '';
      throw new NotionError(`Notion ${method} ${path}: ${res.status} ${data.code ?? ''} ${data.message ?? ''}${hint}`.trim());
    }
    return data as T;
  }

  async queryAll(db: string, maxPages = 3): Promise<NPage[]> {
    const out: NPage[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < maxPages; i++) {
      const r = await this.call<{ results: NPage[]; has_more: boolean; next_cursor: string | null }>(
        'POST', `/databases/${db}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      out.push(...r.results);
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
    return out;
  }

  create(db: string, properties: Props): Promise<NPage> {
    return this.call('POST', '/pages', { parent: { database_id: db }, properties });
  }

  update(pageId: string, properties: Props): Promise<NPage> {
    return this.call('PATCH', `/pages/${pageId}`, { properties });
  }
}

// ---- property builders ---------------------------------------------------------------

export type Props = Record<string, unknown>;
const rt = (s: string) => [{ type: 'text', text: { content: s.slice(0, 2000) } }];

export const P = {
  title: (s: string) => ({ title: rt(s) }),
  text: (s: string) => ({ rich_text: s ? rt(s) : [] }),
  url: (s: string | undefined) => ({ url: s ?? null }),
  check: (b: boolean) => ({ checkbox: b }),
  select: (name: string) => ({ select: { name } }),
  relation: (ids: string[]) => ({ relation: ids.map(id => ({ id })) }),
  date: (d: Due) => ({ date: { start: `${d.date}T${d.time}:00`, time_zone: 'Europe/Prague' } }),
};

// ---- property readers ------------------------------------------------------------------

const plain = (r: RichText | undefined) => (r ?? []).map(t => t.plain_text).join('');

export const R = {
  title(p: NPage): string {
    const t = Object.values(p.properties).find(x => x.type === 'title');
    return plain(t?.title);
  },
  text: (p: NPage, name: string) => plain(p.properties[name]?.rich_text),
  url: (p: NPage, name: string) => p.properties[name]?.url ?? '',
  check: (p: NPage, name: string) => p.properties[name]?.checkbox ?? false,
  select: (p: NPage, name: string) => p.properties[name]?.select?.name ?? '',
  relation: (p: NPage, name: string) => (p.properties[name]?.relation ?? []).map(r => r.id.replace(/-/g, '')),
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (wall clock), or "" when empty. */
  date(p: NPage, name: string): string {
    const s = p.properties[name]?.date?.start ?? '';
    if (s.length <= 10) return s;
    if (/(Z|[+-]\d\d:\d\d)$/.test(s)) { // an absolute instant: show it as Prague wall clock
      const t = pragueParts(Date.parse(s));
      return `${t.y}-${pad(t.m)}-${pad(t.d)}T${pad(t.hh)}:${pad(t.mm)}`;
    }
    return s.slice(0, 16);
  },
};

export const dueKey = (d: Due) => `${d.date}T${d.time}`;
