/**
 * How a courier haul's risks read on the board (issue #944).
 *
 * Its own component rather than markup inlined in the table, because #946 adds
 * the other half of the same picture — hauls priced to be *accepted*, where
 * this one covers hauls that are hard to *complete* — and the two must land as
 * one risk treatment on the row rather than two competing badge systems.
 *
 * What is reusable is the marker itself: the tone and short label
 * below. #946's risks are properties of the *contract* rather than of one end,
 * so they want a row-level sibling in this file reading the same
 * `RISK_COPY`, not a second badge vocabulary.
 */
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
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
 * One marker: the tone and short label every courier risk reads
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
  plain = false,
}: {
  kind: CourierRiskKind;
  detailOptions?: Record<string, string>;
  className?: string;
  /** No tooltip: inside a toggle button, where a focusable child is illegal. The detail modal spells it out. */
  plain?: boolean;
}) {
  const { t } = useTranslation();
  // Static status word: tone and weight, no border (a box reads as a control).
  const tone = cx('text-[0.6875rem] font-medium text-warning', className);
  if (plain) return <span className={tone}>{t(RISK_COPY[kind].short)}</span>;
  return (
    <HintText content={t(RISK_COPY[kind].detail, detailOptions)} className={tone}>
      {t(RISK_COPY[kind].short)}
    </HintText>
  );
}
