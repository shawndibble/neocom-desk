import { isFiniteNumber, isPlainRecord } from './guards.js';
import type { VettingRawRow } from './vettingEngine.js';
import { contractAmount, text } from './vettingRows.js';

const id = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

const withParty = (partyId: number | undefined) => (partyId === undefined ? {} : { partyId });

export function rawWalletRows(characterId: number, rows: readonly unknown[]): VettingRawRow[] {
  return rows.flatMap((row): VettingRawRow[] => {
    if (!isPlainRecord(row)) return [];
    const first = id(row.first_party_id);
    const second = id(row.second_party_id);
    const other = first === characterId ? second : second === characterId ? first : undefined;
    return [
      {
        characterId,
        at: text(row.date),
        what: text(row.ref_type) ?? '',
        ...withParty(other === characterId ? undefined : other),
        ...(isFiniteNumber(row.amount) ? { amount: row.amount } : {}),
      },
    ];
  });
}

export function rawContactRows(characterId: number, rows: readonly unknown[]): VettingRawRow[] {
  return rows.flatMap((row): VettingRawRow[] => {
    if (!isPlainRecord(row)) return [];
    return [
      {
        characterId,
        at: null,
        what: text(row.contact_type) ?? '',
        ...withParty(id(row.contact_id)),
        ...(isFiniteNumber(row.standing) ? { standing: row.standing } : {}),
      },
    ];
  });
}

export function rawMailRows(characterId: number, rows: readonly unknown[]): VettingRawRow[] {
  return rows.flatMap((row): VettingRawRow[] => {
    if (!isPlainRecord(row)) return [];
    const recipients = Array.isArray(row.recipients)
      ? (row.recipients as unknown[]).flatMap((recipient) => {
          const recipientId = isPlainRecord(recipient) ? id(recipient.recipient_id) : undefined;
          return recipientId === undefined ? [] : [recipientId];
        })
      : [];
    const sent = row.from === characterId;
    return [
      {
        characterId,
        at: text(row.timestamp),
        what: sent ? 'Sent' : 'Received',
        ...withParty(sent ? recipients[0] : id(row.from)),
        recipients,
      },
    ];
  });
}

export function rawContractRows(characterId: number, rows: readonly unknown[]): VettingRawRow[] {
  return rows.flatMap((row): VettingRawRow[] => {
    if (!isPlainRecord(row)) return [];
    const issued = row.issuer_id === characterId;
    const other = id(issued ? row.acceptor_id : row.issuer_id);
    const amount = contractAmount(characterId, row);
    const status = text(row.status);
    return [
      {
        characterId,
        at: text(row.date_issued),
        what: text(row.type) ?? '',
        ...withParty(other === characterId ? undefined : other),
        ...(amount === undefined ? {} : { amount }),
        ...(status === null ? {} : { status }),
      },
    ];
  });
}

export function rawSkillRows(characterId: number, body: unknown): VettingRawRow[] {
  if (!isPlainRecord(body) || !Array.isArray(body.skills)) return [];
  return (body.skills as unknown[]).flatMap((skill): VettingRawRow[] =>
    isPlainRecord(skill) &&
    isFiniteNumber(skill.skill_id) &&
    isFiniteNumber(skill.trained_skill_level)
      ? [
          {
            characterId,
            at: null,
            what: '',
            skillId: skill.skill_id,
            level: skill.trained_skill_level,
          },
        ]
      : []
  );
}

export function rawHistoryRows(characterId: number, rows: readonly unknown[]): VettingRawRow[] {
  const stays = rows
    .flatMap((row) =>
      isPlainRecord(row) && isFiniteNumber(row.corporation_id) && typeof row.start_date === 'string'
        ? [{ corporationId: row.corporation_id, startDate: row.start_date }]
        : []
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return stays.map((stay, index) => ({
    characterId,
    at: stay.startDate,
    what: '',
    corporationId: stay.corporationId,
    joined: stay.startDate,
    left: index === 0 ? null : stays[index - 1].startDate,
  }));
}
