/** Shared HTTP helpers for provider analyzers. */

/** Pull the `rel="next"` URL out of a Link header, if the API sent one. */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return null;
}

export interface Page<T> {
  items: T[];
  truncated: boolean;
}

/**
 * Walk a cursor-paginated listing, stopping at `maxPages`.
 *
 * `truncated` is true whenever the walk ended early for any reason - a page
 * cap, a failed request, or a full page with no readable `Link` header. A
 * listing that stopped short must never be reported as a complete total.
 */
export async function paginate<T>(
  firstUrl: string,
  init: RequestInit,
  pageSize: number,
  maxPages: number
): Promise<Page<T>> {
  const items: T[] = [];
  let url: string | null = firstUrl;
  let pages = 0;

  while (url && pages < maxPages) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        console.error(`Listing failed: ${response.status} ${url}`);
        return { items, truncated: true };
      }

      const page = (await response.json()) as T[];
      items.push(...page);
      pages += 1;

      const next = parseNextLink(response.headers.get('Link'));
      if (next) {
        url = next;
        continue;
      }

      url = null;
      if (page.length === pageSize) {
        return { items, truncated: true };
      }
    } catch (error) {
      console.error('Listing failed:', error);
      return { items, truncated: true };
    }
  }

  return { items, truncated: url !== null };
}
