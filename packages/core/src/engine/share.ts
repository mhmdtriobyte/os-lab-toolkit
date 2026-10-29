import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

/** Compress a JSON-serialisable value into a URL-safe string. */
export function encodeState(value: unknown): string {
  return compressToEncodedURIComponent(JSON.stringify(value));
}

/** Inverse of encodeState. Returns undefined for anything that is not a valid encoded value. */
export function decodeState(encoded: string): unknown {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    return json ? (JSON.parse(json) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export interface HashParams {
  /** Encoded module input (`#s=...`). */
  s?: string;
  /** Example id (`#ex=...`). */
  ex?: string;
}

export function parseHash(hash: string): HashParams {
  // Split by hand: URLSearchParams would turn lz-string's "+" into a space.
  const out: HashParams = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    const eq = part.indexOf('=');
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (eq < 1 || !value) continue;
    if (key === 's') out.s = value;
    if (key === 'ex') out.ex = decodeURIComponent(value);
  }
  return out;
}

export function formatHash(params: HashParams): string {
  // lz-string's URI alphabet is already safe; avoid URLSearchParams re-encoding it.
  if (params.s) return `#s=${params.s}`;
  if (params.ex) return `#ex=${encodeURIComponent(params.ex)}`;
  return '';
}
