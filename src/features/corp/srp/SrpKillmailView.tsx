/**
 * What the SRP killmail modals show (issue #5379): the killmail's facts on the left, its fit by slot
 * on the right with a doctrine mark per module, and above both whatever the caller puts there (the
 * pilot's payout, the officer's appraisal comparison). The modals around it are
 * `MemberKillmailModal` and `OfficerKillmailModal`.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { formatPercentDifference, percentDifference, shipFitValue } from '@/engine/srpAppraisal';
import type { Killmail } from '@/esi/endpoints';
import type { DoctrineCheckRecord } from '../srpTypes';
import { fitGroups, offDoctrineCount, type FitMark, type FitSlot } from './killmailFit';
import { useKillmailRead } from './useKillmailRead';
import { useDoctrineTypeNames } from './useDoctrineTypeNames';

/** The loss a killmail modal opens on. */
export interface KillmailSubject {
  killmailId: number;
  killmailHash: string;
  hullTypeId: number;
  hullName: string;
  systemName: string;
  /** Epoch ms. */
  killedAt: number;
}

export type Read<T> = 'loading' | 'failed' | T;

/** Jita values of the lost ship, no cargo, and what zKillboard says the killmail was worth. */
export interface FactValues {
  killmailValue: number | null;
  hullValue: number | null;
  fitValue: number | null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm tabular-nums">
      <dt className="text-text-dim">{label}</dt>
      <dd className="ml-auto text-right">{children}</dd>
    </div>
  );
}

const Dash = () => <span className="text-text-faint">-</span>;
const isk = (value: number | null) => (value === null ? <Dash /> : formatIsk(value));

function Facts({
  subject,
  killmail,
  values,
  typeName,
}: {
  subject: KillmailSubject;
  killmail: Read<Killmail | null>;
  values: FactValues | null;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const zone = useTimeZone();
  const attackers =
    typeof killmail === 'object' && killmail !== null ? killmail.attackers : undefined;
  const finalBlow = attackers?.find((a) => a.final_blow);
  return (
    <dl className="space-y-1">
      <Row label={t('srpKillmail.system')}>{subject.systemName}</Row>
      <Row label={t('srpKillmail.lost')}>{formatTimestamp(new Date(subject.killedAt), zone)}</Row>
      <Row label={t('srpKillmail.killmailValue')}>{isk(values?.killmailValue ?? null)}</Row>
      <Row label={t('srpKillmail.hullFit')}>
        {values?.hullValue != null || values?.fitValue != null ? (
          <>
            {isk(values.hullValue)} / {isk(values.fitValue)}
          </>
        ) : (
          <Dash />
        )}
      </Row>
      {attackers !== undefined && (
        <Row label={t('srpKillmail.attackers')}>
          {finalBlow?.ship_type_id
            ? t('srpKillmail.attackersFinalBlow', {
                count: attackers.length,
                ship: typeName(finalBlow.ship_type_id),
              })
            : attackers.length}
        </Row>
      )}
    </dl>
  );
}

function DoctrineMark({ mark }: { mark: Exclude<FitMark, null> }) {
  const { t } = useTranslation();
  const label = mark === 'doctrine' ? t('srpKillmail.mark.doctrine') : t('srpKillmail.mark.off');
  return (
    <Tooltip content={label}>
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        className={cx('ml-auto', mark === 'doctrine' ? 'text-success' : 'text-warning')}
      >
        {mark === 'doctrine' ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        ) : (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        )}
      </span>
    </Tooltip>
  );
}

function slotLabel(t: ReturnType<typeof useTranslation>['t'], slot: FitSlot): string {
  switch (slot) {
    case 'high':
      return t('srpKillmail.slot.high');
    case 'medium':
      return t('srpKillmail.slot.medium');
    case 'low':
      return t('srpKillmail.slot.low');
    case 'rig':
      return t('srpKillmail.slot.rig');
    case 'subsystem':
      return t('srpKillmail.slot.subsystem');
    case 'drone':
      return t('srpKillmail.slot.drone');
  }
}

function Fit({
  killmail,
  check,
  typeName,
}: {
  killmail: Read<Killmail | null>;
  check: DoctrineCheckRecord | undefined;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  if (killmail === 'loading') return <Spinner size="sm" delayMs={200} />;
  if (killmail === 'failed' || killmail === null) {
    return (
      <p role="status" className="text-xs text-warning">
        {t('srpKillmail.fitFailed')}
      </p>
    );
  }
  const groups = fitGroups(killmail.victim.items ?? [], check);
  const checked = check !== undefined && check.status !== 'not-checked';
  return (
    <div className="space-y-2">
      {checked && (
        <p className="text-xs text-text-dim">
          {t('srpKillmail.checkedAgainst', {
            name: check.doctrineName ?? t('srp.doctrine.unnamed'),
          })}
        </p>
      )}
      {groups.length === 0 && <p className="text-xs text-text-dim">{t('srpKillmail.noFit')}</p>}
      {groups.map((g) => (
        <div key={g.slot}>
          <div className="text-xs uppercase tracking-wide text-text-dim">
            {slotLabel(t, g.slot)}
          </div>
          <ul className="text-sm">
            {g.lines.map((l) => (
              <li key={`${l.typeId}-${l.mark}`} className="flex items-center gap-2">
                <span>
                  {l.count > 1
                    ? t('srp.doctrine.diff.line', { count: l.count, name: typeName(l.typeId) })
                    : typeName(l.typeId)}
                </span>
                {l.mark !== null && <DoctrineMark mark={l.mark} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The killmail's facts beside its fit, with `top` above them. */
export function SrpKillmailView({
  subject,
  check,
  values,
  top,
}: {
  subject: KillmailSubject;
  check: DoctrineCheckRecord | undefined;
  values: FactValues | null;
  top: ReactNode;
}) {
  const killmail = useKillmailRead(subject);
  const items =
    typeof killmail === 'object' && killmail !== null ? killmail.victim.items : undefined;
  const attackers =
    typeof killmail === 'object' && killmail !== null ? killmail.attackers : undefined;
  const typeName = useDoctrineTypeNames([
    ...(items ?? []).map((i) => i.item_type_id),
    ...(attackers ?? []).flatMap((a) => (a.ship_type_id ? [a.ship_type_id] : [])),
  ]);
  return (
    <div className="space-y-4">
      {top}
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <Facts subject={subject} killmail={killmail} values={values} typeName={typeName} />
        <Fit killmail={killmail} check={check} typeName={typeName} />
      </div>
    </div>
  );
}

/** "N modules off doctrine. You can still file; an officer will see this." for the pilot. */
export function OffDoctrineLine({ check }: { check: DoctrineCheckRecord | undefined }) {
  const { t } = useTranslation();
  const count = offDoctrineCount(check);
  if (check?.status !== 'off-doctrine') return null;
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-warning">
      <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {count > 0 ? t('srpKillmail.offDoctrine', { count }) : t('srpKillmail.offDoctrineMissing')}
    </p>
  );
}

/** The officer's appraisal comparison: the lost ship and fit against the nearest Doctrine Fit, no cargo. */
export function AppraisalComparison({
  values,
}: {
  values: Read<{ hullValue: number | null; fitValue: number | null; doctrineValue: number | null }>;
}) {
  const { t } = useTranslation();
  if (values === 'loading') return <Spinner size="sm" delayMs={200} />;
  if (values === 'failed') {
    return <p className="text-sm text-text-dim">{t('srpKillmail.appraisal.failed')}</p>;
  }
  const lost = shipFitValue(values.hullValue, values.fitValue);
  const diff = percentDifference(lost, values.doctrineValue);
  return (
    <dl className="space-y-1">
      <Row label={t('srpKillmail.appraisal.lost')}>{isk(lost)}</Row>
      <Row label={t('srpKillmail.appraisal.doctrine')}>
        {values.doctrineValue === null ? (
          <span className="text-text-dim">{t('srpKillmail.appraisal.doctrineUnavailable')}</span>
        ) : (
          formatIsk(values.doctrineValue)
        )}
      </Row>
      {diff !== null && (
        <Row label={t('srpKillmail.appraisal.difference')}>
          <b>{formatPercentDifference(diff)}</b>
        </Row>
      )}
    </dl>
  );
}
