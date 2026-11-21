// The nightly pass over a book's server-built docs (decision 20261120-235011), against the
// Firestore emulator. Runs only under `npm run test:rules` at the repo root.
import { afterAll, beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { MOON_DOC_SCHEMA } from './corpTaxBookMoonDocs.js';
import { READ_MODELS_SCHEMA } from './corpTaxBookReadModels.js';
import { verifyBook } from './corpTaxBookNightlyVerify.js';

const CORP = 98000001;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const book = () => db.collection('corps').doc(String(CORP));

// Closed: fractured 2 Aug, over by 4 Aug, before the 31 Aug the book is closed through on 18 Oct.
const closed = {
  structureId: 1000,
  moonId: 7,
  extractionStartTime: '2026-07-26T00:00:00.000Z',
  chunkArrivalTime: '2026-08-02T00:00:00.000Z',
  naturalDecayTime: '2026-08-02T03:00:00.000Z',
};
const open = {
  ...closed,
  extractionStartTime: '2026-10-03T00:00:00.000Z',
  chunkArrivalTime: '2026-10-10T00:00:00.000Z',
  naturalDecayTime: '2026-10-10T03:00:00.000Z',
};
const idOf = (x: typeof closed) => `1000_${Date.parse(x.extractionStartTime)}`;

const row = (id: string, date: string, extractionId: string, quantity = 10) =>
  book().collection('observed').doc(id).set({
    structureId: 1000,
    characterId: 50,
    recordedCorporationId: CORP,
    typeId: 45490,
    date,
    quantity,
    cachedAt: '2026-10-11T00:00:00Z',
    extractionId,
  });

emulatorSuite('the nightly pass (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    await book().set({ active: true, startDate: '2026-07-01' });
    await book().collection('meta').doc('extractionIdStamped').set({ at: 0 });
    for (const x of [closed, open]) await book().collection('extractions').doc(idOf(x)).set(x);
    await row('r1', '2026-08-03', idOf(closed));
    await row('r2', '2026-10-11', idOf(open));
  });

  it('deletes the retired Miner totals and their health doc', async () => {
    await book().collection('minerTotals').doc('solo:50').set({ owed: 5 });
    await book().collection('meta').doc('minerTotalsHealth').set({ status: 'ok' });
    await verifyBook(db, CORP, () => NOW);
    expect((await book().collection('minerTotals').get()).empty).toBe(true);
    expect((await book().collection('meta').doc('minerTotalsHealth').get()).exists).toBe(false);
    expect((await book().collection('meta').doc('verifierHealth').get()).data()).toMatchObject({
      status: 'ok',
      overlapCount: 0,
    });
  });

  it('builds every missing moon doc from its own rows, then re-reads only the open pull', async () => {
    await verifyBook(db, CORP, () => NOW);
    const doc = async (x: typeof closed) =>
      (await book().collection('moonDocs').doc(idOf(x)).get()).data();
    expect(await doc(closed)).toMatchObject({
      schema: MOON_DOC_SCHEMA,
      mined: [{ typeId: 45490, quantity: 10 }],
      frozenTax: 0,
    });
    expect(await doc(open)).toMatchObject({ mined: [{ typeId: 45490, quantity: 10 }] });
    // A row of the closed pull that changed is not read again: its doc is current and closed.
    await row('r1', '2026-08-03', idOf(closed), 99);
    await row('r2', '2026-10-11', idOf(open), 20);
    await verifyBook(db, CORP, () => NOW);
    expect((await doc(closed))?.mined).toEqual([{ typeId: 45490, quantity: 10 }]);
    expect((await doc(open))?.mined).toEqual([{ typeId: 45490, quantity: 20 }]);
    expect(
      (await book().collection('meta').doc('verifierHealth').get()).get('moonDocsChecked')
    ).toBe(1);
  });

  it('builds the Overview from the Extractions, and the Miners list from recorded accounts', async () => {
    await book().collection('accounts').doc('solo:50').set({ owed: 100, paid: 0, days: 1 });
    await verifyBook(db, CORP, () => NOW);
    const list = (await book().collection('readModels').doc('minerList').get()).data();
    expect(list).toMatchObject({ schema: READ_MODELS_SCHEMA, miners: [{ minerId: 'solo:50' }] });
    const overview = (await book().collection('readModels').doc('overview').get()).data();
    expect(Object.keys(overview ?? {}).sort()).toEqual(['extractions', 'schema', 'updatedAt']);
    expect(overview?.extractions).toEqual([]);
  });
});
