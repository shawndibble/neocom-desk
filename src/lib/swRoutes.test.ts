import { describe, expect, it } from 'vitest';
import {
  isContractSnapshotObject,
  isEvePortraitImage,
  isEveTypeImage,
  isLazyChunk,
  isVersionedSdeData,
} from './swRoutes';

const ORIGIN = 'https://neocomdesk.app';
const at = (href: string) => new URL(href, ORIGIN);

describe('isVersionedSdeData', () => {
  const match = (href: string, base = '/', mode: RequestMode = 'cors') =>
    isVersionedSdeData(at(href), mode, ORIGIN, base);

  it('matches a same-origin data file requested with ?v=', () => {
    expect(match('/data/masteries.json?v=abc123')).toBe(true);
    expect(match('/data/market/types.json?v=abc123')).toBe(true);
  });

  it('requires ?v= — an unversioned URL must never be cached forever', () => {
    expect(match('/data/masteries.json')).toBe(false);
  });

  it('follows the base URL rather than assuming the site root', () => {
    expect(match('/app/data/types.json?v=abc', '/app/')).toBe(true);
    expect(match('/data/types.json?v=abc', '/app/')).toBe(false);
  });

  it('ignores other origins, vendor/dogma assets and navigations', () => {
    expect(match('https://elsewhere.example/data/types.json?v=abc')).toBe(false);
    expect(match('https://esi.evetech.net/data/types.json?v=abc')).toBe(false);
    expect(match('/vendor/dogma/sde.dat?v=abc')).toBe(false);
    expect(match('/data/types.json?v=abc', '/', 'navigate')).toBe(false);
  });
});

describe('isEveTypeImage', () => {
  it('matches icon, render and bp art on the image server', () => {
    expect(isEveTypeImage(at('https://images.evetech.net/types/587/icon?size=64'))).toBe(true);
    expect(isEveTypeImage(at('https://images.evetech.net/types/587/render?size=512'))).toBe(true);
    expect(isEveTypeImage(at('https://images.evetech.net/types/688/bp?size=32'))).toBe(true);
  });

  it('ignores portraits, ESI, and same-origin paths that look alike', () => {
    expect(isEveTypeImage(at('https://images.evetech.net/characters/1/portrait'))).toBe(false);
    expect(isEveTypeImage(at('https://esi.evetech.net/types/587/'))).toBe(false);
    expect(isEveTypeImage(at('/types/587/icon'))).toBe(false);
  });
});

describe('isEvePortraitImage', () => {
  it('matches character portraits and corp/alliance logos', () => {
    expect(isEvePortraitImage(at('https://images.evetech.net/characters/9/portrait?size=64'))).toBe(
      true
    );
    expect(isEvePortraitImage(at('https://images.evetech.net/corporations/9/logo'))).toBe(true);
    expect(isEvePortraitImage(at('https://images.evetech.net/alliances/9/logo'))).toBe(true);
  });

  it('ignores type art and ESI character endpoints', () => {
    expect(isEvePortraitImage(at('https://images.evetech.net/types/587/icon'))).toBe(false);
    expect(isEvePortraitImage(at('https://esi.evetech.net/characters/9/portrait/'))).toBe(false);
  });
});

describe('isContractSnapshotObject', () => {
  it('matches a per-type object on the snapshot host', () => {
    expect(
      isContractSnapshotObject(
        at('https://data.neocomdesk.com/contract-offers/types/34.0123abcd.json')
      )
    ).toBe(true);
  });

  it('matches the courier rows object', () => {
    expect(
      isContractSnapshotObject(
        at('https://data.neocomdesk.com/courier-contracts/rows.0123abcd.json')
      )
    ).toBe(true);
  });

  it('ignores the index, which changes every publish, and other hosts', () => {
    expect(
      isContractSnapshotObject(at('https://data.neocomdesk.com/contract-offers/index.json'))
    ).toBe(false);
    expect(
      isContractSnapshotObject(at('https://data.neocomdesk.com/courier-contracts/index.json'))
    ).toBe(false);
    expect(isContractSnapshotObject(at('/contract-offers/types/34.0123abcd.json'))).toBe(false);
  });
});

describe('isLazyChunk', () => {
  const match = (href: string, base = '/', mode: RequestMode = 'cors') =>
    isLazyChunk(at(href), mode, ORIGIN, base);

  it('matches a same-origin hashed script or stylesheet under assets/', () => {
    expect(match('/assets/Market-AbC123.js')).toBe(true);
    expect(match('/assets/Market-AbC123.css')).toBe(true);
  });

  it('follows the base URL', () => {
    expect(match('/desk/assets/Market-AbC123.js', '/desk/')).toBe(true);
    expect(match('/assets/Market-AbC123.js', '/desk/')).toBe(false);
  });

  it('ignores other origins, other folders and other file types', () => {
    expect(isLazyChunk(new URL('https://cdn.example/assets/a.js'), 'cors', ORIGIN, '/')).toBe(
      false
    );
    expect(match('/data/masteries.json')).toBe(false);
    expect(match('/assets/logo.png')).toBe(false);
  });

  it('ignores a navigation', () => {
    expect(match('/assets/Market-AbC123.js', '/', 'navigate')).toBe(false);
  });
});
