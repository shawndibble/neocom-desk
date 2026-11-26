import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import type { CourierRiskKind } from '@/engine/contracts/courierRisk';
import type { CourierEndpoint } from '@/engine/contracts/courierSearch';
import { markedEndpointRisks, RISK_COPY } from '@/features/contractSearch/courierRiskLabels';

export function EndpointRiskMarkers({
  endpoint,
  end,
}: {
  endpoint: CourierEndpoint;
  end: 'origin' | 'destination';
}) {
  const marked = markedEndpointRisks(endpoint, end);
  if (marked.length === 0) return null;

  return (
    <>
      {marked.map((kind) => (
        <RiskMarker key={kind} kind={kind} className="ml-1.5" />
      ))}
    </>
  );
}

export function RiskMarker({
  kind,
  detailOptions,
  className,
  plain = false,
}: {
  kind: CourierRiskKind;
  detailOptions?: Record<string, string>;
  className?: string;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const tone = cx('text-[0.6875rem] font-medium text-warning', className);
  if (plain) return <span className={tone}>{t(RISK_COPY[kind].short)}</span>;
  return (
    <HintText content={t(RISK_COPY[kind].detail, detailOptions)} className={tone}>
      {t(RISK_COPY[kind].short)}
    </HintText>
  );
}
