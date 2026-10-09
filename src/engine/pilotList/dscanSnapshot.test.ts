import { describe, expect, it } from 'vitest';
import { classifyPilotPaste } from './parsePilotPaste';
import {
  buildDscanSnapshot,
  dscanSnapshotReuseKey,
  MAX_DSCAN_SNAPSHOT_CHARS,
  parseDscanSnapshot,
} from './dscanSnapshot';

const SCAN = '626\tMy Vexor\tVexor\t1,234 km\n11379\t\tHyperion\t-\n626\tOther\tVexor\t2 AU';

describe('dscan snapshot', () => {
  it('round-trips a scan to the same type ids the sender saw', () => {
    const built = buildDscanSnapshot(SCAN);
    if (!built.ok) throw new Error('expected a snapshot');
    const stored = JSON.parse(JSON.stringify(built.value));
    const parsed = parseDscanSnapshot(stored);
    const sender = classifyPilotPaste(SCAN);
    if (sender?.kind !== 'dscan') throw new Error('expected a D-Scan');
    expect(parsed?.typeIds).toEqual(sender.typeIds);
    expect(parsed?.text).toBe(sender.text);
    expect(parsed?.rows).toEqual(sender.rows);
  });

  it('refuses text that is not a D-Scan', () => {
    expect(buildDscanSnapshot('Alpha\nBeta')).toEqual({ ok: false, reason: 'not-dscan' });
  });

  it('refuses a scan past the size cap', () => {
    const row = '626\tMy Vexor\tVexor\t1,234 km';
    const rows = Math.ceil(MAX_DSCAN_SNAPSHOT_CHARS / row.length) + 1;
    const big = Array.from({ length: rows }, () => row).join('\n');
    expect(buildDscanSnapshot(big)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('reads a malformed or oversized payload as invalid', () => {
    expect(parseDscanSnapshot(null)).toBeNull();
    expect(parseDscanSnapshot({ v: 2, text: SCAN })).toBeNull();
    expect(parseDscanSnapshot({ v: 1, text: 'Alpha\nBeta' })).toBeNull();
    expect(
      parseDscanSnapshot({ v: 1, text: '626\tx\n'.repeat(MAX_DSCAN_SNAPSHOT_CHARS) })
    ).toBeNull();
  });

  it('keys the same scan to the same link', () => {
    const a = buildDscanSnapshot(SCAN);
    const b = buildDscanSnapshot(`${SCAN}\n`);
    if (!a.ok || !b.ok) throw new Error('expected snapshots');
    expect(dscanSnapshotReuseKey(a.value)).toBe(dscanSnapshotReuseKey(b.value));
  });
});
