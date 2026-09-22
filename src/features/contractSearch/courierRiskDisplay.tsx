/**
 * How a courier haul's risks read on the board (issue #944).
 *
 * Its own component rather than markup inlined in the table, because #946 adds
 * the other half of the same picture — hauls priced to be *accepted*, where
 * this one covers hauls that are hard to *complete* — and the two must land as
 * one risk treatment on the row rather than two competing badge systems.
 *
 * What is reusable is the marker itself: the border, tone and short label
 * below. #946's risks are properties of the *contract* rather than of one end,
 * so they want a row-level sibling in this file reading the same
 * `RISK_COPY`, not a second badge vocabulary.
 */
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { endpointRisks, type CourierRiskKind } from '@/engine/contracts/courierRisk';
import type { CourierEndpoint } from '@/engine/contracts/courierSearch';
import { MARKED_RISKS, RISK_COPY } from '@/features/contractSearch/courierRiskLabels';

/**
 * The markers for one end of a haul, beside the end they describe — so "this
 * delivery point is a player structure" is attached to the delivery point
 * rather than floating at row level, where a reader would have to guess which
 * end it meant.
 *
 * Rendered inside the existing two-line route cell, which is one table column
 * and therefore one card line when the table stacks below `sm`. No column is
 * added, and no card line.
 */
export function EndpointRiskMarkers({
  endpoint,
  end,
}: {
  endpoint: CourierEndpoint;
  end: 'origin' | 'destination';
}) {
  const marked = endpointRisks(endpoint, end).filter((kind) => MARKED_RISKS.includes(kind));
  if (marked.length === 0) return null;

  return (
    <>
      {marked.map((kind) => (
        <RiskMarker key={kind} kind={kind} className="ml-1.5" />
      ))}
    </>
  );
}

/**
 * One marker: the border, tone and short label every courier risk reads
 * under, wherever it is drawn — beside an endpoint, or on a folded lane's
 * header on a phone, which must carry its members' warnings so that
 * collapsing a group can never hide one.
 *
 * `detailOptions` interpolates the sentence; only `over-rate`'s needs any
 * (its multiple).
 */
export function RiskMarker({
  kind,
  detailOptions,
  className,
}: {
  kind: CourierRiskKind;
  detailOptions?: Record<string, string>;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      // `title` carries the full sentence for a pointer; the detail modal
      // spells every flag out for everyone else, which is where the
      // decision is actually made. #947 is where this should converge on
      // the `Tooltip` the design system documents for explaining triggers.
      title={t(RISK_COPY[kind].detail, detailOptions)}
      className={cx(
        'rounded-xs border border-warning/40 px-1 text-[0.6875rem] text-warning',
        className
      )}
    >
      {t(RISK_COPY[kind].short)}
    </span>
  );
}
