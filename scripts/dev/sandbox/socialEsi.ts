/**
 * Stage 2 sandbox data: contracts, mail, calendar, contacts, and the names that make every
 * generated id read as a person or corporation instead of "Unknown 91000003". Plugged into
 * `installPersonalEsi` (personalEsi.ts), which owns the route registration.
 */
import playerGroups from './playerGroups.json' with { type: 'json' };
import {
  CHARACTER_ID,
  CHARACTER_NAME,
  CORPORATION_ID,
  CORPORATION_NAME,
  ALLIANCE_ID,
  ALLIANCE_NAME,
} from '../../../e2e/support/fixtureData';
import { DAY_MS, HOUR_MS } from '../../../src/lib/age';

import { iso, mix, STATION_NAMES } from './gen';

const PILOTS = [
  'Aria Vance',
  'Bram Okafor',
  'Cato Reyes',
  'Dara Lindqvist',
  'Edda Voss',
  'Finn Maru',
  'Gale Idris',
  'Hana Brandt',
  'Ivo Takeda',
  'Juno Castellan',
];
const CORPS = ['Hedion Haulers', 'Sebiestor Salvage', 'Pator Mining Co', 'Outer Ring Traders'];
/** First id of the generated pilots (the wallet journal's counterparties use the same range). */
const PILOT_BASE = 91_000_000;
const CORP_BASE = 92_000_000;

/** id -> display name for POST /universe/names; every generated id the sandbox shows. */
export function nameFor(
  id: number
): { name: string; category: 'character' | 'corporation' | 'alliance' | 'station' } | undefined {
  if (STATION_NAMES[id]) return { name: STATION_NAMES[id], category: 'station' };
  if (id === CHARACTER_ID) return { name: CHARACTER_NAME, category: 'character' };
  if (id === CORPORATION_ID) return { name: CORPORATION_NAME, category: 'corporation' };
  if (id === ALLIANCE_ID) return { name: ALLIANCE_NAME, category: 'alliance' };
  if (id >= PILOT_BASE && id < PILOT_BASE + PILOTS.length)
    return { name: PILOTS[id - PILOT_BASE], category: 'character' };
  if (id >= CORP_BASE && id < CORP_BASE + CORPS.length)
    return { name: CORPS[id - CORP_BASE], category: 'corporation' };
  // The Player-groups fixture (playerGroups.json), corp members and outside alts alike.
  const grouped = [...playerGroups.corp, ...playerGroups.outside].find((f) => f.id === id);
  if (grouped) return { name: grouped.name, category: 'character' };
  // The Corp Tax Book seed's characters (scripts/dev/seed-corp-tax-book.mjs).
  if (id === 90_000_002) return { name: 'Dev Member', category: 'character' };
  if (id === 90_000_003) return { name: 'Dev Guest', category: 'character' };
  if (id >= 90_001_000 && id < 90_001_100)
    return { name: `Dev Miner ${id - 90_001_000 + 1}`, category: 'character' };
  if (id >= 98_999_000 && id < 98_999_100)
    return { name: `Guest Corp ${id - 98_999_000 + 1}`, category: 'corporation' };
  if (id === 98_999_999) return { name: 'Guest Corp', category: 'corporation' };
  return undefined;
}

const STATIONS = [60003760, 60008494];

export function contracts() {
  const types = ['item_exchange', 'courier', 'auction', 'item_exchange', 'courier'] as const;
  const statuses = [
    'outstanding',
    'finished',
    'in_progress',
    'outstanding',
    'finished',
    'cancelled',
    'rejected',
  ] as const;
  return Array.from({ length: 24 }, (_, i) => {
    const type = types[i % types.length];
    const status = statuses[i % statuses.length];
    const mine = i % 3 === 0;
    const other = PILOT_BASE + (i % PILOTS.length);
    return {
      contract_id: 300_000 + i,
      issuer_id: mine ? CHARACTER_ID : other,
      issuer_corporation_id: mine ? CORPORATION_ID : CORP_BASE + (i % CORPS.length),
      assignee_id: mine ? other : CHARACTER_ID,
      acceptor_id: status === 'finished' ? (mine ? other : CHARACTER_ID) : 0,
      type,
      status,
      for_corporation: false,
      availability: 'personal' as const,
      date_issued: iso(-(i * 11 + 2) * HOUR_MS),
      date_expired: iso((20 - i) * DAY_MS),
      title: type === 'courier' ? `Haul ${i}` : i % 4 === 0 ? 'Moon goo buyback' : '',
      price:
        type === 'item_exchange' ? 5_000_000 + mix(i) * 90_000 : type === 'auction' ? 1_000_000 : 0,
      buyout: type === 'auction' ? 9_000_000 + mix(i) * 10_000 : undefined,
      reward: type === 'courier' ? 2_000_000 + mix(i) * 20_000 : 0,
      collateral: type === 'courier' ? 150_000_000 : undefined,
      volume: type === 'courier' ? 12_500 : 900,
      days_to_complete: type === 'courier' ? 7 : undefined,
      date_accepted:
        status === 'finished' || status === 'in_progress' ? iso(-(i * 11) * HOUR_MS) : undefined,
      date_completed: status === 'finished' ? iso(-(i * 9) * HOUR_MS) : undefined,
      start_location_id: STATIONS[i % 2],
      end_location_id: STATIONS[(i + 1) % 2],
    };
  });
}

export function contractItems(contractId: number) {
  const base = [34, 35, 36, 37, 45490, 45491, 24698, 22544];
  return [0, 1, 2].map((k) => ({
    record_id: contractId * 10 + k,
    type_id: base[(contractId + k) % base.length],
    quantity: 1 + ((contractId + k) % 4) * 250,
    is_included: true,
    is_singleton: false,
  }));
}

const MAIL_SUBJECTS = [
  'Moon mining tax statement',
  'Fleet op tonight 19:00',
  'Re: Jita 4-4 buyback',
  'Payment received, thanks!',
  'Your contract was accepted',
  'Welcome to the corp',
  'Structure fuel running low',
  'Ore for sale, bulk',
];

export function mailHeaders() {
  return Array.from({ length: 28 }, (_, i) => ({
    mail_id: 400_000 + i,
    from: i % 4 === 0 ? CHARACTER_ID : PILOT_BASE + (i % PILOTS.length),
    subject: `${MAIL_SUBJECTS[i % MAIL_SUBJECTS.length]}${i >= 8 ? ` (${i})` : ''}`,
    timestamp: iso(-(i * 7 + 1) * HOUR_MS),
    is_read: i % 3 !== 0,
    // Real ESI system label ids: 1 Inbox, 2 Sent, 4 Corp, 8 Alliance.
    labels: [i % 4 === 0 ? 2 : i % 5 === 0 ? 4 : 1],
    recipients:
      i % 6 === 5
        ? [{ recipient_id: MAILING_LIST_ID, recipient_type: 'mailing_list' as const }]
        : [
            {
              recipient_id: i % 4 === 0 ? PILOT_BASE : CHARACTER_ID,
              recipient_type: 'character' as const,
            },
          ],
  }));
}

export function mailBody(mailId: number) {
  const head = mailHeaders().find((m) => m.mail_id === mailId) ?? mailHeaders()[0];
  return {
    from: head.from,
    subject: head.subject,
    timestamp: head.timestamp,
    read: head.is_read,
    labels: head.labels,
    recipients: head.recipients,
    body: `Hello,<br><br>${head.subject}. This is generated sandbox mail (#${mailId}).<br><br><b>Totals</b><br>Zeolites 12,400 m3<br>Tax due 4,310,000 ISK<br><br>o7`,
  };
}

export const MAIL_LABELS = {
  labels: [
    { label_id: 1, name: 'Inbox', color: '#ffffff', unread_count: 9 },
    { label_id: 2, name: 'Sent', color: '#ffffff', unread_count: 0 },
    { label_id: 4, name: 'Corp', color: '#0000fe', unread_count: 2 },
    { label_id: 8, name: 'Alliance', color: '#006634', unread_count: 0 },
  ],
  total_unread_count: 11,
};
const MAILING_LIST_ID = 93_000_001;
export const MAILING_LISTS = [{ mailing_list_id: MAILING_LIST_ID, name: 'Moon Miners' }];

export function calendar() {
  return Array.from({ length: 9 }, (_, i) => ({
    event_id: 500_000 + i,
    event_date: iso((i * 19 + 5) * HOUR_MS),
    title: [
      'Mining fleet',
      'Moon pop: Athanor Alpha',
      'Corp meeting',
      'Roam',
      'Structure defense',
      'PI reset',
      'Hauling run',
      'Capital op',
      'Newbro night',
    ][i],
    importance: i % 3,
    event_response: (['accepted', 'not_responded', 'tentative', 'declined'] as const)[i % 4],
  }));
}

export function calendarEvent(eventId: number) {
  const ev = calendar().find((e) => e.event_id === eventId) ?? calendar()[0];
  return {
    event_id: ev.event_id,
    title: ev.title,
    date: ev.event_date,
    duration: 90,
    importance: ev.importance,
    owner_id: CORPORATION_ID,
    owner_name: CORPORATION_NAME,
    owner_type: 'corporation',
    response: ev.event_response,
    text: `Generated sandbox event. Bring a Retriever or Covetor. Form up in Amarr.`,
  };
}

export const CONTACT_LABELS = [
  { label_id: 1, label_name: 'Allies' },
  { label_id: 2, label_name: 'Customers' },
];

export function contacts() {
  return Array.from({ length: 20 }, (_, i) => {
    const isCorp = i % 5 === 4;
    return {
      contact_id: isCorp ? CORP_BASE + (i % CORPS.length) : PILOT_BASE + (i % PILOTS.length),
      contact_type: isCorp ? ('corporation' as const) : ('character' as const),
      standing: [10, 5, 0, -5, -10, 7.5][i % 6],
      is_watched: i % 4 === 0,
      is_blocked: i % 9 === 8,
      label_ids: i % 2 === 0 ? [1] : [2],
    };
  });
}

/** Newest first, as ESI returns it; the last entry is the corp the Character is in now. */
export function corporationHistory() {
  return [
    { record_id: 400, corporation_id: CORPORATION_ID, start_date: iso(-120 * DAY_MS) },
    { record_id: 300, corporation_id: CORP_BASE + 1, start_date: iso(-400 * DAY_MS) },
    { record_id: 200, corporation_id: CORP_BASE + 2, start_date: iso(-900 * DAY_MS) },
    { record_id: 100, corporation_id: 1_000_009, start_date: iso(-1400 * DAY_MS) },
  ];
}
