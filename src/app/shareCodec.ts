/**
 * shareCodec — compact, compressed encoding of a {@link DesignState} for share links.
 *
 * The old format was `base64(JSON.stringify(state))`, where the geometry serialises as hundreds of
 * `{"x":0.123456789,"y":...}` objects with full-precision floats — so the `?design=` param ballooned
 * to thousands of characters and some messaging apps truncated the link. This codec keeps the design
 * fully restorable while shrinking it ~10–20× by:
 *
 *   1. Re-shaping into a terse object (`{v,f,c,s,k}`) with point lists flattened to integer arrays
 *      (each unit-square coordinate × 1e4 — precision 1e-4, far finer than the ~0.5% snap epsilon).
 *   2. DEFLATE-compressing the JSON (numeric geometry is highly repetitive → compresses well).
 *   3. base64url so the result is URL-safe with no `%`-escaping bloat.
 *
 * Encoding/decoding are async (the Compression Streams API is async). Old `base64(JSON)` links still
 * decode via {@link decodeLegacyDesign}, so links shared before this change keep working.
 */

import type { DesignState, PaperStockProps } from '../engine/api';
import type { Point } from '../core/geometry';

/** Short URL param carrying the compact+compressed design (vs the legacy verbose `?design=`). */
export const SHARE_PARAM = 'd';
/** Legacy param: `base64(JSON.stringify(DesignState))`. Still decoded for old links. */
export const LEGACY_PARAM = 'design';

const Q = 1e4; // coordinate quantisation: unit-square coord × 1e4 → integer (precision 1e-4).

/** Terse on-the-wire shape. Keys are 1 char to keep the pre-compression JSON small. */
interface Packed {
  readonly v: 1;
  readonly f: string;
  /** Cut contours: each a flat `[x0,y0,x1,y1,…]` of integers (coord × 1e4). */
  readonly c: readonly number[][];
  /** Pending strokes (usually empty in the lasso model), same packing as `c`. */
  readonly s: readonly number[][];
  readonly k: PaperStockProps;
}

const packPoints = (pts: readonly Point[]): number[] => {
  const out: number[] = [];
  for (const p of pts) {
    out.push(Math.round(p.x * Q), Math.round(p.y * Q));
  }
  return out;
};

const unpackPoints = (flat: readonly number[]): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ x: flat[i]! / Q, y: flat[i + 1]! / Q });
  }
  return out;
};

// ── base64url ↔ bytes ─────────────────────────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // chunk to avoid arg-count limits on String.fromCharCode.
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── DEFLATE via the Compression Streams API ─────────────────────────────────────────────────────

async function pipeThrough(data: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const buf = await new Response(transform.readable).arrayBuffer();
  return new Uint8Array(buf);
}

const deflate = (data: Uint8Array) => pipeThrough(data, new CompressionStream('deflate-raw'));
const inflate = (data: Uint8Array) => pipeThrough(data, new DecompressionStream('deflate-raw'));

// ── public API ────────────────────────────────────────────────────────────────────────────────

/** Encode a design into the compact+compressed `?d=` payload (base64url). */
export async function encodeDesign(state: DesignState): Promise<string> {
  const packed: Packed = {
    v: 1,
    f: state.foldId,
    c: state.cuts.map(packPoints),
    s: state.strokes.map(packPoints),
    k: state.stock ?? {},
  };
  const json = new TextEncoder().encode(JSON.stringify(packed));
  const compressed = await deflate(json);
  return bytesToBase64Url(compressed);
}

/** Decode a `?d=` payload back to a DesignState, or `null` if malformed. */
export async function decodeDesign(param: string): Promise<DesignState | null> {
  try {
    const bytes = base64UrlToBytes(param);
    const json = new TextDecoder().decode(await inflate(bytes));
    const p = JSON.parse(json) as Packed;
    if (p.v !== 1 || typeof p.f !== 'string') return null;
    return {
      version: 1,
      foldId: p.f,
      cuts: (p.c ?? []).map(unpackPoints),
      strokes: (p.s ?? []).map(unpackPoints),
      stock: p.k ?? {},
    };
  } catch {
    return null;
  }
}

/** Decode a legacy `?design=` link: `encodeURIComponent(btoa(JSON.stringify(DesignState)))`. */
export function decodeLegacyDesign(param: string): DesignState | PaperStockProps | null {
  try {
    return JSON.parse(atob(decodeURIComponent(param)));
  } catch {
    return null;
  }
}

/** Build the full share URL for a design (async — compression is async). */
export async function buildShareUrl(state: DesignState): Promise<string> {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${SHARE_PARAM}=${await encodeDesign(state)}`;
}
