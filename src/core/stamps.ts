/**
 * Stamp shapes (M2) — the classic paper-cutting unit patterns (单位纹样), as pure point generators.
 *
 * Each function returns a closed polygon (CCW, no repeated closing vertex) in unit-square space,
 * centred on `center` and sized by `size` (≈ the shape's radius/half-width). No DOM/Paper.js — the
 * editor's stamp tool drops one of these at the click point, then runs it through `validatePath`
 * exactly like a freehand cut (clip to wedge, snap, etc.).
 */

import type { Point } from './geometry';

export type StampKind = 'crescent' | 'circle' | 'sawtooth' | 'triangle';

const TAU = Math.PI * 2;

/** 圆点纹 — a regular polygon approximating a circle of radius `size`. */
export function circleStamp(center: Point, size: number, segments = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    out.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
  }
  return out;
}

/** 三角纹 — an upward-pointing equilateral triangle inscribed in a circle of radius `size`. */
export function triangleStamp(center: Point, size: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 3; i++) {
    // Start at the top (90°) and step by 120°.
    const a = Math.PI / 2 + (i * TAU) / 3;
    out.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
  }
  return out;
}

/**
 * 锯齿纹 — a sawtooth strip: a flat baseline with `teeth` triangular points along its top edge.
 * Spans `2·size` horizontally and `size` vertically, centred on `center`.
 */
export function sawtoothStamp(center: Point, size: number, teeth = 4): Point[] {
  const width = 2 * size;
  const left = center.x - size;
  const baseY = center.y - size / 2;
  const tipY = center.y + size / 2;
  const out: Point[] = [];
  // Top edge, left → right: alternate baseline valley and peak for each tooth.
  for (let i = 0; i < teeth; i++) {
    const x0 = left + (i / teeth) * width;
    const xMid = left + ((i + 0.5) / teeth) * width;
    out.push({ x: x0, y: baseY });
    out.push({ x: xMid, y: tipY });
  }
  // Bottom-right then bottom-left to close the strip.
  out.push({ x: left + width, y: baseY });
  out.push({ x: left, y: baseY });
  return out;
}

/**
 * 月牙纹 — a crescent moon (lune): an outer disk of radius `size` with a concave bite carved by a
 * second circle offset toward +x. The boundary is the outer circle's major (back) arc joined to the
 * bite circle's near arc, meeting exactly at the two circle intersections — so it stays inside the
 * outer radius and never self-intersects. Opens toward +x.
 */
export function crescentStamp(center: Point, size: number, segments = 24): Point[] {
  const R = size; // outer radius
  const d = size * 0.55; // bite-circle offset along +x
  const rb = size * 0.85; // bite radius (must satisfy |R−rb| < d < R+rb to intersect)
  // Intersection of the two circles (symmetric about the x-axis through both centres).
  const xi = (d * d + R * R - rb * rb) / (2 * d);
  const yi = Math.sqrt(Math.max(0, R * R - xi * xi));
  const aOuter = Math.atan2(yi, xi); // intersection angle on the outer circle
  const aBite = Math.atan2(yi, xi - d); // intersection angle on the bite circle (in (90°,180°))

  const out: Point[] = [];
  // Outer back arc: from +aOuter CCW round the far side to −aOuter (the rounded outside of the moon).
  for (let i = 0; i <= segments; i++) {
    const a = aOuter + (i / segments) * (TAU - 2 * aOuter);
    out.push({ x: center.x + R * Math.cos(a), y: center.y + R * Math.sin(a) });
  }
  // Bite near arc: from the lower intersection back up to the upper, passing through the bite's
  // leftmost point (concave inner edge). Strictly-interior samples avoid duplicating the endpoints.
  for (let i = 1; i < segments; i++) {
    const a = TAU - aBite + (i / segments) * (2 * aBite - TAU);
    out.push({ x: center.x + d + rb * Math.cos(a), y: center.y + rb * Math.sin(a) });
  }
  return out;
}

/** Build a stamp polygon by kind. */
export function makeStamp(kind: StampKind, center: Point, size: number): Point[] {
  switch (kind) {
    case 'circle':
      return circleStamp(center, size);
    case 'triangle':
      return triangleStamp(center, size);
    case 'sawtooth':
      return sawtoothStamp(center, size);
    case 'crescent':
      return crescentStamp(center, size);
  }
}
