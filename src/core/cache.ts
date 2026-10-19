import { Actor, log } from 'apify';

// Priori operational scaffold: cache the bulk source file so we do not re-download
// it on every run. Freshness uses a single CONDITIONAL GET (If-Modified-Since):
// the FDA server returns 304 Not Modified when the file is unchanged (serve
// cache), or 200 with the new body when it changes, including a mid-month repost
// under the same filename. One request, no HEAD/GET thrash, no wall-clock guess.
// The zip is stored base64-encoded in one JSON record so it round-trips
// identically in every storage backend.

const CACHE_STORE = 'priori-orange-book-cache';
const CACHE_KEY = 'source';
const USER_AGENT = 'PrioriIntelligence/0.1 (+https://prioriintelligence.com; greg@prioriintelligence.com)';

interface CacheRecord {
  version: string; // e.g. "Orange Book EOBZIP_2026_05.zip"
  lastModified: string; // the validator we revalidate against
  base64: string;
}

function versionFrom(headers: Headers, fallback: string): { version: string; lastModified: string } {
  const disposition = headers.get('content-disposition') ?? '';
  const nameMatch = disposition.match(/filename=([^;]+)/i);
  const filename = nameMatch ? nameMatch[1]!.trim() : '';
  const lastModified = headers.get('last-modified') ?? '';
  const version = filename ? `Orange Book ${filename}` : (lastModified ? `Orange Book (${lastModified})` : fallback);
  return { version, lastModified };
}

export async function getCachedOrDownload(
  url: string,
): Promise<{ bytes: Uint8Array; sourceVersion: string; fromCache: boolean }> {
  const store = await Actor.openKeyValueStore(CACHE_STORE);
  const cached = (await store.getValue<CacheRecord>(CACHE_KEY)) ?? null;

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (cached?.base64 && cached.lastModified) {
    headers['If-Modified-Since'] = cached.lastModified;
  }

  log.info(`Fetching Orange Book data files from ${url}`);
  const res = await fetch(url, { headers });

  if (res.status === 304 && cached?.base64) {
    log.info(`Using cached Orange Book (${cached.version}); server returned 304 Not Modified.`);
    return {
      bytes: new Uint8Array(Buffer.from(cached.base64, 'base64')),
      sourceVersion: cached.version,
      fromCache: true,
    };
  }
  if (!res.ok) throw new Error(`Orange Book download failed: HTTP ${res.status} ${res.statusText}`);

  const { version, lastModified } = versionFrom(res.headers, 'Orange Book (unknown version)');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const record: CacheRecord = { version, lastModified, base64: Buffer.from(bytes).toString('base64') };
  await store.setValue(CACHE_KEY, record);

  return { bytes, sourceVersion: version, fromCache: false };
}
