import { describe, expect, it } from 'vitest';
import { symmetricalTriangle } from '../core/foldConfig';
import { validatePath } from '../core/validate';
import { unfold, DEFAULT_EPSILON } from '../core/unfold';
import type { EditorEngine } from '../engine/api';
import { getTemplate, loadTemplateInto, templates } from './index';

describe('test-circles template', () => {
  const tpl = getTemplate('test-circles')!;

  it('is registered with the expected shape', () => {
    expect(tpl).toBeDefined();
    expect(tpl.foldId).toBe('symmetrical-triangle');
    expect(tpl.cuts).toHaveLength(3);
    expect(templates['test-circles']).toBe(tpl);
  });

  it('every cut validates against its fold (in-wedge, simple, non-degenerate)', () => {
    for (const cut of tpl.cuts) {
      const result = validatePath(cut, symmetricalTriangle, DEFAULT_EPSILON);
      expect(result.ok, result.messages.join('; ')).toBe(true);
    }
  });

  it('unfolds each cut into the full 8-copy symmetric set', () => {
    const cleaned = tpl.cuts.map(
      (c) => validatePath(c, symmetricalTriangle, DEFAULT_EPSILON).path!,
    );
    const { copies } = unfold(cleaned, symmetricalTriangle);
    expect(copies).toHaveLength(8 * cleaned.length);
  });
});

describe('loadTemplateInto', () => {
  function stubEngine() {
    const calls: { method: string; arg?: unknown }[] = [];
    const rec = (method: string) => (arg?: unknown) => calls.push({ method, arg });
    const engine = {
      loadFoldConfig: rec('loadFoldConfig'),
      clearPaths: rec('clearPaths'),
      addCutPath: rec('addCutPath'),
    } as unknown as EditorEngine;
    return { engine, calls };
  }

  it('selects the fold, clears, then commits each cut in order', () => {
    const { engine, calls } = stubEngine();
    const ok = loadTemplateInto(engine, 'test-circles');
    expect(ok).toBe(true);
    expect(calls[0]).toEqual({ method: 'loadFoldConfig', arg: 'symmetrical-triangle' });
    expect(calls[1]!.method).toBe('clearPaths');
    expect(calls.filter((c) => c.method === 'addCutPath')).toHaveLength(3);
  });

  it('returns false and does nothing for an unknown id', () => {
    const { engine, calls } = stubEngine();
    expect(loadTemplateInto(engine, 'no-such-template')).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
