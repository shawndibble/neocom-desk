import {
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  TOKENS_COLLECTION,
} from '../../../functions/src/corpTaxBookVersionKeys';
import {
  NOTICE_ID_FIELD,
  minerPaymentCode,
  paymentCode,
  type LateNotice,
} from '../../../functions/src/corpTaxBookLateNotice';
import { MONTHS } from '../../../src/engine/corpTaxBook/monthNames';
import { utcDay } from '../../../src/engine/localDay';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../../src/lib/age';
import type { SeedDoc } from './emulator';
import { CORP, OFFICER, nameOf, recordedCorpOf, solo } from './identities';
import { UNIT_PRICE } from './prices';

export const RATE_PCT = 10;
export const DAY_QTY = 10_000;
export const DAY_TAX = (DAY_QTY * UNIT_PRICE * RATE_PCT) / 100;
export { minerPaymentCode };

export const ORE_TYPE = 45490;

export const REFINERY = {
  alpha: {
    id: 1_040_000_000_001,
    name: 'E2E Athanor Alpha',
    systemId: 30002187,
    systemName: 'Amamake',
    moonId: 40139001,
  },
  beta: {
    id: 1_040_000_000_002,
    name: 'E2E Tatara Beta',
    systemId: 30002053,
    systemName: 'Hek',
    moonId: 40139002,
  },
} as const;
export type RefineryKey = keyof typeof REFINERY;

export const day = (back: number, now = Date.now()): string => utcDay(now - back * DAY_MS);
export const shortDay = (back: number, now = Date.now()): string => {
  const [, m, d] = day(back, now).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
export const isk = (amount: number): string => Math.round(amount).toLocaleString('en-US');
export const verifyToken = (label: string): string =>
  `e2e-${label}`
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .padEnd(43, 'x')
    .slice(0, 43);

export const noonOf = (back: number, now = Date.now()): string => `${day(back, now)}T12:00:00.000Z`;

export interface MinedDay {
  back: number;
  refinery?: RefineryKey;
  qty?: number;
}

export interface Donation {
  id: string;
  characterId: number;
  amount: number;
  back: number;
  minerId?: string;
  reason?: string;
  reviewReason?: 'ambiguous' | 'account-closed';
  ambiguousMinerIds?: string[];
  refId?: number;
}

interface NoticeInput {
  id: string;
  characterId: number;
  minerId?: string;
  days: readonly number[];
  issuedBack: number;
  refinery?: RefineryKey;
  final?: boolean;
  remindersStopped?: boolean;
  token: string;
}

export class BookSeed {
  readonly now = Date.now();
  private readonly out = new Map<string, Record<string, unknown>>();
  private readonly mined = new Map<number, MinedDay[]>();
  readonly corp: number;

  constructor(
    private readonly options: {
      startBack: number;
      lastSyncBack?: number;
      tolerancePct?: number;
      corporationId?: number;
    }
  ) {
    this.corp = options.corporationId ?? CORP;
    const start = day(options.startBack, this.now);
    this.put(`corps/${this.corp}`, {
      hubId: 'jita',
      oreForm: 'raw',
      graceHours: 0.5,
      overdueDays: 14,
      divisions: [1],
      startDate: start,
      structureExpiryHours: {},
      rates: [{ scope: 'corp', pct: RATE_PCT, effectiveFrom: start }],
      corporationId: this.corp,
      active: true,
      ownerCharacterId: OFFICER.id,
      createdAt: this.now - options.startBack * DAY_MS,
      createdBy: OFFICER.id,
      lastSync: {
        at: this.now - (options.lastSyncBack ?? 0) * DAY_MS - MINUTE_MS,
        byCharacterId: OFFICER.id,
        byName: OFFICER.name,
        gaps: [],
      },
      ...(options.tolerancePct !== undefined ? { dayTolerancePct: options.tolerancePct } : {}),
      schemaVersion: 1,
    });
  }

  private put(path: string, data: Record<string, unknown>): this {
    this.out.set(path, data);
    return this;
  }

  private sub(name: string, id: string, data: Record<string, unknown>): this {
    return this.put(`corps/${this.corp}/${name}/${id}`, data);
  }

  mine(characterId: number, days: readonly (number | MinedDay)[]): this {
    for (const entry of days) {
      const d: MinedDay = typeof entry === 'number' ? { back: entry } : entry;
      const refinery = REFINERY[d.refinery ?? 'alpha'];
      const date = day(d.back, this.now);
      this.mined.set(characterId, [...(this.mined.get(characterId) ?? []), d]);
      this.sub('observed', `${characterId}_${ORE_TYPE}_${date}_${refinery.id}`, {
        structureId: refinery.id,
        characterId,
        recordedCorporationId: this.corp === CORP ? recordedCorpOf(characterId) : this.corp,
        typeId: ORE_TYPE,
        date,
        quantity: d.qty ?? DAY_QTY,
        cachedAt: new Date(this.now - d.back * DAY_MS + 20 * HOUR_MS).toISOString(),
        solarSystemId: refinery.systemId,
        moonId: refinery.moonId,
        uid: `char:${characterId}`,
      });
    }
    return this;
  }

  donation(p: Donation): this {
    const id = p.refId !== undefined ? `j1_${p.refId}` : p.id;
    return this.sub('payments', id, {
      id,
      source: 'donation',
      characterId: p.characterId,
      uid: `char:${p.characterId}`,
      amount: p.amount,
      at: noonOf(p.back, this.now),
      division: 1,
      ...(p.minerId ? { minerId: p.minerId } : {}),
      ...(p.reason ? { reason: p.reason } : {}),
      ...(p.reviewReason ? { reviewReason: p.reviewReason } : {}),
      ...(p.ambiguousMinerIds ? { ambiguousMinerIds: p.ambiguousMinerIds } : {}),
    });
  }

  group(id: string, characterIds: readonly number[], createdBack = 60): this {
    return this.sub('miners', id, {
      id,
      characterIds: [...characterIds],
      mainCharacterId: characterIds[0],
      pendingConfirmation: [],
      officerClaimed: [],
      provenCharacterIds: [],
      confirmedCharacterIds: [],
      createdAt: new Date(this.now - createdBack * DAY_MS).toISOString(),
      uids: characterIds.map((c) => `char:${c}`),
    });
  }

  private noticeLines(input: NoticeInput) {
    const refinery = REFINERY[input.refinery ?? 'alpha'];
    return [...input.days]
      .sort((a, b) => b - a)
      .map((back) => {
        const date = day(back, this.now);
        const value = DAY_QTY * UNIT_PRICE;
        return {
          kind: 'mined' as const,
          date,
          key: `${input.characterId}:${refinery.id}:${date}`,
          characterId: input.characterId,
          structureId: refinery.id,
          oreLines: [{ typeId: ORE_TYPE, quantity: DAY_QTY }],
          unitPrices: { [ORE_TYPE]: UNIT_PRICE },
          priceSources: { [ORE_TYPE]: 'historical' },
          taxPct: RATE_PCT,
          rateEffectiveFrom: day(this.options.startBack, this.now),
          estimatedValue: value,
          tax: (value * RATE_PCT) / 100,
        };
      });
  }

  private token(input: NoticeInput, minerId: string): void {
    this.put(`${TOKENS_COLLECTION}/${input.token}`, {
      corporationId: this.corp,
      [NOTICE_ID_FIELD]: input.id,
      minerId,
      remindersStopped: input.remindersStopped === true,
      createdAt: this.now - input.issuedBack * DAY_MS,
    });
  }

  private notice(input: NoticeInput): LateNotice {
    const lines = this.noticeLines(input);
    return {
      id: input.id,
      minerId: input.minerId ?? solo(input.characterId),
      characterIds: [input.characterId],
      kind: input.final ? 'final' : 'late',
      issuedAt: new Date(this.now - input.issuedBack * DAY_MS).toISOString(),
      issuedBy: OFFICER.id,
      code: paymentCode(input.id),
      pricing: { hubId: 'jita', oreForm: 'raw' },
      uids: [`char:${input.characterId}`],
      lines,
      listed: lines.reduce((sum, l) => sum + l.tax, 0),
      mail: { sent: 1, manualSent: 0, remindersStopped: input.remindersStopped === true },
      names: {
        corporationName: 'Test Corp',
        minerName: nameOf(input.characterId),
        refineryNames: Object.fromEntries(
          Object.values(REFINERY).map((r) => [String(r.id), r.name])
        ),
      },
    };
  }

  lateNotice(input: NoticeInput): this {
    const notice = this.notice(input);
    this.sub(LATE_NOTICES, input.id, { ...notice });
    this.sub(LATE_NOTICE_LINKS, input.id, { token: input.token });
    this.token(input, notice.minerId);
    return this;
  }

  declaration(p: {
    id: string;
    noticeId: string;
    kind?: 'contract' | 'other-division' | 'wrong-corp';
    amount?: number;
    note?: string;
    back: number;
    characterId: number;
  }): this {
    return this.sub('declarations', p.id, {
      id: p.id,
      [NOTICE_ID_FIELD]: p.noticeId,
      kind: p.kind ?? 'contract',
      at: noonOf(p.back, this.now),
      characterId: p.characterId,
      uid: `char:${p.characterId}`,
      ...(p.amount !== undefined ? { amount: p.amount } : {}),
      ...(p.note ? { note: p.note } : {}),
    });
  }

  dispute(p: {
    characterId: number;
    back: number;
    kind: 'quantity' | 'notPaying';
    reason: string;
    qty: number;
    filedBack?: number;
    refinery?: RefineryKey;
  }): this {
    const minerId = solo(p.characterId);
    const date = day(p.back, this.now);
    const id = `${minerId.replace(/[^A-Za-z0-9_-]/g, '_')}_${date}`;
    return this.sub('disputes', id, {
      id,
      minerId,
      date,
      kind: p.kind,
      reason: p.reason,
      by: p.characterId,
      at: noonOf(p.filedBack ?? 1, this.now),
      uids: [`char:${p.characterId}`],
      lines: [
        {
          recordKey: `${p.characterId}:${REFINERY[p.refinery ?? 'alpha'].id}:${date}`,
          typeId: ORE_TYPE,
          quantity: p.qty,
          payeeName: '',
        },
      ],
    });
  }

  raw(collection: string, id: string, data: Record<string, unknown>): this {
    return this.sub(collection, id, data);
  }

  docs(): SeedDoc[] {
    const root = `corps/${this.corp}`;
    const stamp = `seed-${this.now}`;
    const collections = new Set(
      [...this.out.keys()]
        .filter((path) => path.startsWith(`${root}/`))
        .map((path) => path.split('/')[2])
    );
    return [...this.out].map(([path, data]) =>
      path === root
        ? {
            path,
            data: {
              ...data,
              bookVersion: stamp,
              collectionVersions: Object.fromEntries([...collections].map((c) => [c, stamp])),
            },
          }
        : { path, data }
    );
  }
}
