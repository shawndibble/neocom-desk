import { describe, it, expect } from 'vitest';
import {
  RETENTION_MS,
  assetsFromServiceWorker,
  parseAssetHistory,
  planRetention,
} from './assetRetention.mjs';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

describe('planRetention', () => {
  it('retires last build’s assets the new build no longer has, and carries them', () => {
    const plan = planRetention({
      previous: { current: ['assets/Market-old.js', 'assets/db-same.js'], retired: {} },
      built: ['assets/Market-new.js', 'assets/db-same.js'],
      now: NOW,
    });
    expect(plan.carry).toEqual(['assets/Market-old.js']);
    expect(plan.history).toEqual({
      deployedAt: NOW,
      current: ['assets/Market-new.js', 'assets/db-same.js'],
      retired: { 'assets/Market-old.js': NOW },
    });
  });

  it('keeps an asset retired by an earlier deploy until the retention window runs out', () => {
    const plan = planRetention({
      previous: {
        current: [],
        retired: {
          'assets/a-kept.js': NOW - RETENTION_MS + HOUR,
          'assets/b-dropped.js': NOW - RETENTION_MS - 1,
        },
      },
      built: [],
      now: NOW,
    });
    expect(plan.carry).toEqual(['assets/a-kept.js']);
    expect(plan.history.retired).toEqual({ 'assets/a-kept.js': NOW - RETENTION_MS + HOUR });
  });

  it('counts retention from when an asset left the build, not when it first shipped', () => {
    // A chunk current for days, replaced today, must still be carried.
    const plan = planRetention({
      previous: { current: ['assets/x-old.js'], retired: {} },
      built: [],
      now: NOW,
    });
    expect(plan.carry).toEqual(['assets/x-old.js']);
  });

  it('un-retires an asset the new build ships again', () => {
    const plan = planRetention({
      previous: { current: [], retired: { 'assets/back.js': NOW - HOUR } },
      built: ['assets/back.js'],
      now: NOW,
    });
    expect(plan.carry).toEqual([]);
    expect(plan.history.retired).toEqual({});
  });

  it('keeps the earlier retirement time for an asset already retired', () => {
    const plan = planRetention({
      previous: { current: ['assets/x.js'], retired: { 'assets/x.js': NOW - HOUR } },
      built: [],
      now: NOW,
    });
    expect(plan.history.retired).toEqual({ 'assets/x.js': NOW - HOUR });
  });
});

describe('parseAssetHistory', () => {
  it('reads a history file this script wrote', () => {
    const history = {
      deployedAt: NOW,
      current: ['assets/a.js'],
      retired: { 'assets/b.css': NOW - HOUR },
    };
    expect(parseAssetHistory(JSON.stringify(history))).toEqual({
      current: ['assets/a.js'],
      retired: { 'assets/b.css': NOW - HOUR },
    });
  });

  it('is empty for anything that is not a history file', () => {
    const empty = { current: [], retired: {} };
    expect(parseAssetHistory('<!doctype html>')).toEqual(empty);
    expect(parseAssetHistory('null')).toEqual(empty);
    expect(parseAssetHistory('{"current":"nope","retired":[]}')).toEqual(empty);
  });

  it('drops any path that is not a flat file under assets/', () => {
    // The file comes back off the live site; a bad entry must never let the
    // deploy write outside dist/assets/ or carry index.html / sw.js.
    const text = JSON.stringify({
      current: ['assets/ok.js', '../etc/passwd', 'index.html', 'assets/../sw.js', 'assets/a/b.js'],
      retired: { 'assets/ok.css': NOW, 'sw.js': NOW, 'assets/bad.js': 'soon' },
    });
    expect(parseAssetHistory(text)).toEqual({
      current: ['assets/ok.js'],
      retired: { 'assets/ok.css': NOW },
    });
  });
});

describe('assetsFromServiceWorker', () => {
  it('lists the assets/ entries of a built precache manifest', () => {
    const sw =
      'precacheAndRoute([{"revision":null,"url":"assets/Market-DoVqb48Z.js"},' +
      '{"revision":"abc","url":"index.html"},{"revision":null,"url":"assets/index-B_0.css"}])';
    expect(assetsFromServiceWorker(sw)).toEqual([
      'assets/Market-DoVqb48Z.js',
      'assets/index-B_0.css',
    ]);
  });
});
