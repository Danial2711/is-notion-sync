// Plain-HTTP client with a cookie jar and a shared subrequest budget.
// Workers on the free plan allow 50 subrequests per invocation. IS and Notion calls share
// one Budget, so a run stops cleanly before it hits that limit (the next run continues).

export class HttpError extends Error {}
export class BudgetError extends HttpError {}

export class Budget {
  used = 0;
  constructor(readonly limit = 48) {}
  get remaining(): number { return this.limit - this.used; }
  take(): void {
    if (this.used >= this.limit) throw new BudgetError(`subrequest budget (${this.limit}) used up`);
    this.used++;
  }
}

interface Cookie { name: string; value: string; domain: string; hostOnly: boolean }

export class CookieJar {
  private cookies: Cookie[] = [];

  store(url: string, headers: Headers): void {
    const host = new URL(url).hostname;
    for (const line of headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair!.indexOf('=');
      if (eq < 1) continue;
      const name = pair!.slice(0, eq).trim(), value = pair!.slice(eq + 1).trim();
      let domain = host, hostOnly = true, expired = false;
      for (const a of attrs) {
        const [k, v = ''] = a.split('=').map(s => s.trim());
        const key = k!.toLowerCase();
        if (key === 'domain' && v) { domain = v.replace(/^\./, '').toLowerCase(); hostOnly = false; }
        if (key === 'max-age' && Number(v) <= 0) expired = true;
        if (key === 'expires' && Date.parse(v) < Date.now()) expired = true;
      }
      this.cookies = this.cookies.filter(c => !(c.name === name && c.domain === domain));
      if (!expired) this.cookies.push({ name, value, domain, hostOnly });
    }
  }

  header(url: string): string {
    const host = new URL(url).hostname;
    return this.cookies
      .filter(c => (c.hostOnly ? host === c.domain : host === c.domain || host.endsWith(`.${c.domain}`)))
      .map(c => `${c.name}=${c.value}`).join('; ');
  }
}

export interface Resp { status: number; url: string; html: string }
export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) is-notion-sync/1.0';

/** Browser-like session: follows redirects by hand so cookies set on every hop are kept. */
export class Session {
  readonly jar = new CookieJar();
  // Wrapped in an arrow: Workers throw "Illegal invocation" if fetch is called as a method.
  constructor(private budget: Budget, private fetcher: Fetcher = (i, init) => fetch(i, init)) {}

  async req(url: string, opts: { method?: 'GET' | 'POST'; form?: Record<string, string> } = {}): Promise<Resp> {
    let method = opts.method ?? 'GET';
    let body: string | undefined = opts.form ? new URLSearchParams(opts.form).toString() : undefined;
    for (let hop = 0; hop < 10; hop++) {
      this.budget.take();
      const headers: Record<string, string> = { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.8', accept: 'text/html,*/*' };
      const cookie = this.jar.header(url);
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
      const res = await this.fetcher(url, { method, headers, body, redirect: 'manual' });
      this.jar.store(url, res.headers);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        if (res.status !== 307 && res.status !== 308) { method = 'GET'; body = undefined; }
        url = new URL(location, url).toString();
        continue;
      }
      return { status: res.status, url, html: await res.text() };
    }
    throw new HttpError(`too many redirects at ${url}`);
  }
}
