import { AllianceLink, CorporationLink } from '@/features/entities';
import type { PilotListRow } from './pilotListData';

export function PilotAffiliation({
  row,
  className,
}: {
  row: Pick<PilotListRow, 'corporationId' | 'corporationName' | 'allianceId' | 'allianceName'>;
  className?: string;
}) {
  const parts = [
    row.corporationName ? (
      row.corporationId === null ? (
        row.corporationName
      ) : (
        <CorporationLink id={row.corporationId} className="min-w-0 truncate">
          {row.corporationName}
        </CorporationLink>
      )
    ) : null,
    row.allianceName ? (
      row.allianceId === null ? (
        row.allianceName
      ) : (
        <AllianceLink id={row.allianceId} className="min-w-0 truncate">
          {row.allianceName}
        </AllianceLink>
      )
    ) : null,
  ].map((part, i) => ({ part, key: i }));
  const shown = parts.filter((p) => p.part !== null);
  if (shown.length === 0) return null;
  return (
    <div className={className}>
      <div className="flex min-w-0 items-baseline gap-x-1">
        {shown.map(({ part, key }, i) => (
          <span key={key} className="flex min-w-0 items-baseline gap-x-1">
            {i > 0 && <span aria-hidden>·</span>}
            <span className="min-w-0 truncate">{part}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
