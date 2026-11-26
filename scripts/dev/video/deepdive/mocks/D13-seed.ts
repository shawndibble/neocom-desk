/**
 * D13: seeds Halcyon Forge Industries' Corp Tax Book and SRP into the Firestore emulator (layout of
 * scripts/dev/seed-corp-tax-book.mjs and functions/src/corpTaxBookStore.ts), with invented names.
 * Wipes the emulator first.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CORP_ID, MEMBERS, OFFICER_ID, STRUCTURES, memberByName } from './D13-hfind';
import { DOCTRINES, KILLMAILS, SRP_SETTINGS, claimsSeed } from './D13-srpData';

const require = createRequire(fileURLToPath(new URL('../../../../../functions/package.json', import.meta.url)));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

export const OFFICER_HASH = 'WORLD-ARDEN';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const EMULATOR = '127.0.0.1:8080';
const PROJECT = 'demo-neocom-desk';
export const CORP_NAME = 'Halcyon Forge Industries';

export interface SeedResult {
  verifyUrl: string;
  featuredMinerId: number;
  featuredName: string;
}

export async function seedHalcyon(): Promise<SeedResult> {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
  if (getApps().length === 0) initializeApp({ projectId: PROJECT });
  const db = getFirestore();
  const NOW = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const day = (back: number) => iso(NOW - back * DAY).slice(0, 10);
  const refineries = STRUCTURES.filter((s) => s.refinery).map((s) => ({
    id: s.id, name: s.name, solarSystemId: s.systemId, moonId: s.moonId!,
  }));
  const ORES = [
    { typeId: 45490, price: 1200 },
    { typeId: 45491, price: 1500 },
    { typeId: 45492, price: 1000 },
  ];
  const RATE = 5;
  const START = day(60);
  const book = db.collection('corps').doc(String(CORP_ID));
  const sub = (name: string) => book.collection(name);
  const writes: [unknown, Record<string, unknown>][] = [];
  const put = (ref: unknown, data: Record<string, unknown>) => writes.push([ref, data]);

  put(book, {
    hubId: 'jita', oreForm: 'raw', graceHours: 6, overdueDays: 14, divisions: [2],
    cadence: { kind: 'monthly' }, startDate: START, structureExpiryHours: {},
    rates: [{ scope: 'corp', pct: RATE, effectiveFrom: START }],
    corporationId: CORP_ID, active: true, ownerCharacterId: OFFICER_ID, createdAt: NOW - 60 * DAY, createdBy: OFFICER_ID,
    lastSync: { at: NOW - HOUR, byCharacterId: OFFICER_ID, byName: 'Arden Kessil', gaps: [] }, schemaVersion: 1,
  });
  put(sub('officers').doc(`char:${OFFICER_ID}`), {
    isCeo: false, isDirector: true, isStationManager: true, canView: true, canEdit: true,
    characterId: OFFICER_ID, characterName: 'Arden Kessil', ownerHash: OFFICER_HASH, corporationId: CORP_ID,
    roles: ['Director'], checkedAt: NOW, expiresAt: NOW + 7 * 24 * HOUR,
  });

  // Miners: a dozen members. `days` are days back with mining; `pays` the payment pattern.
  const OLD = [38, 37, 35, 33, 31, 29, 27, 25, 23, 21, 19, 17];
  const RECENT = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const featured = memberByName('Casimir Vael');
  const second = memberByName('Joren Fell');
  const third = memberByName('Dagny Alvane');
  const others = ['Rhosyn Marek', 'Odalys Venn', 'Kaelen Voss', 'Lucan Dray', 'Wystan Pryce', 'Zephyr Ashgrove', 'Emric Sol', 'Ilse Karrow', 'Aurelio Maks'].map(memberByName);
  type Pay = 'none' | 'partial' | 'full' | 'over' | 'third';
  interface Miner { id: number; name: string; corp: number; days: number[]; pays: Pay; noticed: boolean }
  const MINERS: Miner[] = [
    { id: featured.id, name: featured.name, corp: CORP_ID, days: [...OLD], pays: 'partial', noticed: false },
    { id: second.id, name: second.name, corp: CORP_ID, days: [...OLD.slice(2), ...RECENT.slice(3)], pays: 'third', noticed: false },
    { id: third.id, name: third.name, corp: CORP_ID, days: [...OLD.slice(4), 9, 8, 4, 3], pays: 'none', noticed: false },
    ...others.map((m, i): Miner => ({
      id: m.id, name: m.name, corp: CORP_ID,
      days: i % 3 === 0 ? [...RECENT] : i % 3 === 1 ? [11, 10, 9, 5, 4, 2] : [8, 7, 6, 3, 2, 1],
      pays: (['full', 'partial', 'full', 'over', 'none', 'full', 'third', 'full', 'partial'] as Pay[])[i],
      noticed: i % 2 === 0,
    })),
  ];
  const minedQty = (charId: number, back: number, typeId: number, structureId: number) =>
    8_000 + ((charId + back * 7 + typeId + structureId) % 9) * 2_500;
  const rowsOf = (m: Miner) => {
    const rows: Record<string, unknown>[] = [];
    for (const back of m.days) {
      const structure = refineries[(back + m.id) % refineries.length];
      for (const ore of ORES)
        rows.push({
          structureId: structure.id, characterId: m.id, recordedCorporationId: m.corp, typeId: ore.typeId,
          date: day(back), quantity: minedQty(m.id, back, ore.typeId, structure.id),
          cachedAt: iso(NOW - back * DAY + 20 * HOUR), solarSystemId: structure.solarSystemId, moonId: structure.moonId,
        });
    }
    return rows;
  };
  const rowsByMiner = new Map(MINERS.map((m) => [m.id, rowsOf(m)]));
  for (const rows of rowsByMiner.values())
    for (const r of rows)
      put(sub('observed').doc(`${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`), { ...r, uid: `char:${r.characterId}` });

  // Issued late notices: miners flagged `noticed` got one 6 days ago for their days older than 14 days.
  const paymentCode = (seed: string) => {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
  };
  let verifyToken = '';
  const noticeOf = new Map<number, { noticeId: string; minerId: string; amount: number; code: string }>();
  for (const m of MINERS) {
    const rows = rowsByMiner.get(m.id)!;
    const dayBacks = m.noticed ? m.days.filter((b) => b >= 9 && b <= 12) : [];
    // Every miner paying something needs a notice's code; unnoticed miners pay by id-less donation.
    if (!m.noticed && m.id !== featured.id) continue;
    const billedBacks = m.id === featured.id ? [] : dayBacks;
    const minerId = `solo:${m.id}`;
    const code = paymentCode(`miner:${minerId}`);
    noticeOf.set(m.id, { noticeId: `ln-${m.id}-1`, minerId, amount: 0, code });
    if (billedBacks.length === 0) continue;
    const lines = billedBacks.reverse().map((back) => {
      const dayRows = rows.filter((r) => r.date === day(back));
      const structure = refineries.find((s) => s.id === dayRows[0].structureId)!;
      const value = dayRows.reduce((sum, r) => sum + (r.quantity as number) * ORES.find((o) => o.typeId === r.typeId)!.price, 0);
      return {
        kind: 'mined', date: day(back), key: `${m.id}:${structure.id}:${day(back)}`, characterId: m.id, structureId: structure.id,
        oreLines: dayRows.map((r) => ({ typeId: r.typeId, quantity: r.quantity })),
        unitPrices: Object.fromEntries(ORES.map((o) => [o.typeId, o.price])),
        priceSources: Object.fromEntries(ORES.map((o) => [o.typeId, 'historical'])),
        taxPct: RATE, rateEffectiveFrom: START, estimatedValue: value, tax: Math.round((value * RATE) / 100),
      };
    });
    const amount = lines.reduce((s, l) => s + l.tax, 0);
    const noticeId = `ln-${m.id}-1`;
    put(sub('lateNotices').doc(noticeId), {
      id: noticeId, minerId, characterIds: [m.id], kind: 'late', issuedAt: iso(NOW - 6 * DAY), issuedBy: OFFICER_ID, code,
      pricing: { hubId: 'jita', oreForm: 'raw' }, uids: [`char:${m.id}`], lines, listed: amount,
      mail: { sent: 1, manualSent: 0, remindersStopped: false, lastAt: iso(NOW - 6 * DAY) },
      names: { corporationName: CORP_NAME, minerName: m.name, refineryNames: Object.fromEntries(refineries.map((r) => [String(r.id), r.name])) },
    });
    const token = randomBytes(32).toString('base64url');
    if (m.id === others[0].id) verifyToken = token;
    put(sub('lateNoticeLinks').doc(noticeId), { token });
    put(db.collection('corpTaxBookTokens').doc(token), { corporationId: CORP_ID, statementId: noticeId, minerId, remindersStopped: false, createdAt: NOW - 6 * DAY });
    noticeOf.get(m.id)!.amount = amount;
  }

  // Payments (player donations into the Moon Tax division).
  const donation = (refId: number, characterId: number, amount: number, back: number, extra: Record<string, unknown> = {}) => ({
    id: `j2_${refId}`, source: 'donation', characterId, uid: `char:${characterId}`, amount, at: iso(NOW - back * DAY), division: 2, ...extra,
  });
  let ref = 900_000;
  const payments: Record<string, unknown>[] = [];
  // Featured miner: three donations, each carrying their payment code, each matched to their oldest unpaid days.
  const fCode = paymentCode(`miner:solo:${featured.id}`);
  payments.push(donation((ref += 1), featured.id, 9_400_000, 31, { reason: fCode, minerId: `solo:${featured.id}` }));
  payments.push(donation((ref += 1), featured.id, 12_800_000, 22, { reason: fCode, minerId: `solo:${featured.id}` }));
  payments.push(donation((ref += 1), featured.id, 6_300_000, 14, { reason: fCode, minerId: `solo:${featured.id}` }));
  const sCode = paymentCode(`miner:solo:${second.id}`);
  payments.push(donation((ref += 1), second.id, 21_000_000, 20, { reason: sCode, minerId: `solo:${second.id}` }));
  for (const m of others) {
    const st = noticeOf.get(m.id);
    if (!st || st.amount === 0) continue;
    const mm = MINERS.find((x) => x.id === m.id)!;
    const pin = (amt: number, back: number) => donation((ref += 1), m.id, amt, back, { reason: st.code, minerId: st.minerId });
    if (mm.pays === 'full') payments.push(pin(st.amount, 5));
    if (mm.pays === 'partial') payments.push(pin(Math.round(st.amount * 0.6), 4));
    if (mm.pays === 'over') payments.push(pin(Math.round(st.amount * 1.2), 3));
    if (mm.pays === 'third') payments.push(pin(Math.round(st.amount / 3), 4));
  }
  payments.push(donation((ref += 1), memberByName('Stellan Hode').id, 2_500_000, 3, { reason: 'moon tax' }));
  payments.push(donation((ref += 1), memberByName('Brynja Tolland').id, 3_100_000, 1));
  payments.push(donation((ref += 1), memberByName('Kaelen Voss').id, 40_000_000, 5, {
    notTaxAmount: 40_000_000, notTaxReason: 'Contract payment, not moon tax', notTaxBy: OFFICER_ID, notTaxAt: iso(NOW - 4 * DAY),
  }));
  for (const p of payments) put(sub('payments').doc(p.id as string), p);

  // Extractions.
  refineries.forEach((s, i) => {
    const mk = (startedAgoH: number, arrivesInH: number, decaysInH: number, laserAgoH?: number) => {
      const start = NOW - startedAgoH * HOUR;
      const id = `${s.id}_${Date.parse(iso(start))}`;
      put(sub('extractions').doc(id), {
        structureId: s.id, moonId: s.moonId, extractionStartTime: iso(start), chunkArrivalTime: iso(NOW + arrivesInH * HOUR),
        naturalDecayTime: iso(NOW + decaysInH * HOUR), id, ...(laserAgoH === undefined ? {} : { laserFiredAt: iso(NOW - laserAgoH * HOUR) }),
      });
    };
    mk(400, -300, -250);
    const live = i % 4;
    if (live === 0) mk(24, 72 + i * 10, 120 + i * 10);
    if (live === 1) mk(120, -2, 46);
    if (live === 2) mk(200, -80, -30, 30);
    if (live === 3) mk(60, 8, 56);
  });

  // SRP.
  put(book.collection('srp').doc('settings'), {
    corporationId: CORP_ID, enabled: true, ...SRP_SETTINGS, createdBy: OFFICER_ID, createdAt: NOW - 30 * DAY,
    ownerCharacterId: OFFICER_ID, updatedAt: NOW - 3 * DAY, updatedBy: OFFICER_ID, schemaVersion: 1,
  });
  put(book.collection('srpOfficers').doc(`char:${OFFICER_ID}`), {
    canEdit: true, canManage: true, isCeo: false, isDirector: true, characterId: OFFICER_ID, characterName: 'Arden Kessil',
    ownerHash: OFFICER_HASH, corporationId: CORP_ID, roles: ['Director'], checkedAt: NOW, expiresAt: NOW + 7 * 24 * HOUR,
  });
  DOCTRINES.forEach((d) =>
    put(book.collection('srpDoctrines').doc(d.id), { ...d, createdBy: OFFICER_ID, createdAt: NOW - 20 * DAY }));
  const claims = claimsSeed(NOW);
  for (const c of claims) {
    const km = KILLMAILS.find((k) => k.id === c.killmailId)!;
    const doc: Record<string, unknown> = {
      killmailId: c.killmailId, killmailHash: km.hash, corporationId: CORP_ID, characterId: c.pilot.id, characterName: c.pilot.name,
      uid: `char:${c.pilot.id}`, ownerHash: `WORLD-${c.pilot.id}`, hullTypeId: km.hull, solarSystemId: km.system,
      killedAt: c.filedAt - 2 * HOUR, filedAt: c.filedAt, state: c.state, amount: c.amount,
      basis: c.basis, suggested: null, fleetOrFc: c.fc ?? null, note: c.note ?? null, refileCount: 0,
      ...(c.check ? { doctrineCheck: c.check } : {}),
    };
    if (c.state !== 'pending') {
      doc.decidedAt = c.filedAt + 2 * HOUR; doc.decidedBy = OFFICER_ID; doc.decidedByName = 'Arden Kessil';
    }
    if (c.state === 'rejected') { doc.rejectionReason = c.reason; doc.closedAt = c.filedAt + 2 * HOUR; }
    if (c.state === 'paid') { doc.paidAt = c.filedAt + 6 * HOUR; doc.paidBy = OFFICER_ID; doc.paidByName = 'Arden Kessil'; doc.closedAt = c.filedAt + 6 * HOUR; }
    put(book.collection('srpClaims').doc(String(c.killmailId)), doc);
    const entry = (at: number, action: string, by: number, byName: string) =>
      put(book.collection('srpAudit').doc(`${String(at).padStart(15, '0')}~${randomBytes(6).toString('base64url')}`), {
        at, by, byName, action, detail: { killmailId: c.killmailId, hullTypeId: km.hull, amount: c.amount },
      });
    entry(c.filedAt, 'fileClaim', c.pilot.id, c.pilot.name);
    if (c.state !== 'pending') entry(c.filedAt + 2 * HOUR, c.state === 'rejected' ? 'rejectClaim' : 'approveClaim', OFFICER_ID, 'Arden Kessil');
    if (c.state === 'paid') entry(c.filedAt + 6 * HOUR, 'markClaimPaid', OFFICER_ID, 'Arden Kessil');
  }

  // Audit trail.
  const audit = (at: number, action: string, detail: Record<string, unknown>) =>
    put(sub('audit').doc(`${String(at).padStart(15, '0')}~${randomBytes(6).toString('base64url')}`), {
      at, by: OFFICER_ID, byName: 'Arden Kessil', action, detail,
    });
  audit(NOW - 60 * DAY, 'turnOn', { startDate: START, startRatePct: RATE });
  for (const st of noticeOf.values()) if (st.amount > 0) audit(NOW - 6 * DAY, 'issueLateNotice', { noticeId: st.noticeId, minerId: st.minerId, listed: st.amount });

  await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [r, data] of writes.slice(i, i + 400)) batch.set(r, data);
    await batch.commit();
  }
  return { verifyUrl: `/corp-tax-book/verify/${verifyToken}`, featuredMinerId: featured.id, featuredName: featured.name };
}

export { MEMBERS };
