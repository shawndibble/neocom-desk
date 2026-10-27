import { describe, it, expect } from 'vitest';
import {
  ccpBuildFromSdeJsonl,
  ccpBuildFromZipUrl,
  fuzzworkDumpFromListing,
  sdeUpdateDecision,
} from './sdeBuild.mjs';

describe('fuzzworkDumpFromListing', () => {
  it("reads the dump's build-numbered name from the /dump/latest/ index", () => {
    const html = `<a href="csv/">csv/</a>
      <a href="sdeyaml_mysql_3607705_20261012_133001.sql.gz">x</a>
      <a href="eve_3607705_20261012_133001.db.gz">y</a>`;
    expect(fuzzworkDumpFromListing(html)).toEqual({
      dir: '3607705_20261012_133001',
      build: 3607705,
    });
  });

  it('throws when the index names no dump, or two different ones', () => {
    expect(() => fuzzworkDumpFromListing('<a href="csv/">csv/</a>')).toThrow(/no build-numbered/);
    expect(() =>
      fuzzworkDumpFromListing('eve_3607705_20261012_133001.db.gz eve_3586130_20261011_230457.db.gz')
    ).toThrow(/more than one/);
  });
});

describe('ccpBuildFromZipUrl', () => {
  it('reads the build number from the file "latest" redirects to', () => {
    expect(
      ccpBuildFromZipUrl(
        'https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-3607705-jsonl.zip'
      )
    ).toBe(3607705);
  });

  it('throws on any other file name', () => {
    expect(() => ccpBuildFromZipUrl('https://example.com/latest.zip')).toThrow(/unrecognised/);
  });
});

describe('ccpBuildFromSdeJsonl', () => {
  it("reads buildNumber from the export's _sde.jsonl", () => {
    expect(
      ccpBuildFromSdeJsonl(
        '{"_key": "sde", "buildNumber": 3607705, "releaseDate": "2026-10-12T11:08:38Z"}\n'
      )
    ).toBe(3607705);
  });

  it('throws when it has none', () => {
    expect(() => ccpBuildFromSdeJsonl('{"_key": "sde"}')).toThrow(/buildNumber/);
  });
});

describe('sdeUpdateDecision', () => {
  it('rebuilds when CCP and Fuzzwork agree on a build newer than the baked one', () => {
    expect(sdeUpdateDecision({ ccp: 3607705, fuzzwork: 3607705, baked: 3586130 })).toEqual({
      update: true,
      stale: false,
      reason: 'build 3607705 replaces 3586130',
    });
  });

  it('rebuilds when nothing has been stamped yet', () => {
    expect(sdeUpdateDecision({ ccp: 3607705, fuzzwork: 3607705, baked: null }).update).toBe(true);
  });

  it('waits while Fuzzwork lags CCP', () => {
    expect(
      sdeUpdateDecision({
        ccp: 3607705,
        fuzzwork: 3586130,
        baked: 3586130,
        ccpAgeDays: 1,
      })
    ).toEqual({
      update: false,
      stale: false,
      reason: 'Fuzzwork is on 3586130, CCP on 3607705: waiting for them to agree',
    });
  });

  it('calls it stale once Fuzzwork has lagged a newer CCP build for over 3 days', () => {
    expect(
      sdeUpdateDecision({ ccp: 3607705, fuzzwork: 3586130, baked: 3586130, ccpAgeDays: 4 })
    ).toEqual({
      update: false,
      stale: true,
      reason: 'Fuzzwork is still on 3586130, 4 days after CCP shipped 3607705',
    });
  });

  it('never calls a lag stale when the baked build is already current', () => {
    expect(
      sdeUpdateDecision({ ccp: 3607705, fuzzwork: 3586130, baked: 3607705, ccpAgeDays: 9 }).stale
    ).toBe(false);
  });

  it('does nothing when the baked build is current', () => {
    expect(sdeUpdateDecision({ ccp: 3607705, fuzzwork: 3607705, baked: 3607705 })).toEqual({
      update: false,
      stale: false,
      reason: 'build 3607705 is already baked',
    });
  });
});
