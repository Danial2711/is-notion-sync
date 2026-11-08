// Tiny regex-based HTML helpers: cheap on CPU (Workers free plan = 10 ms per run).

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const dropScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');

/** Visible text on one line. */
export function text(html: string): string {
  return decode(dropScripts(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Visible text keeping line breaks (block ends, <br>, newlines inside <pre>). */
export function lines(html: string): string[] {
  const t = decode(dropScripts(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|pre|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
  return t.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
}
