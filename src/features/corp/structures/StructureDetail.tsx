/**
 * One structure in full, beside the Structures table: every service and its
 * state, each clock in EVE time and local time, and a refinery's moon
 * extraction when the reader can read extractions. Entity links live here,
 * not in the row (DESIGN.md §6c restraint).
 */
import { useTranslation } from 'react-i18next';
import { Eyebrow, SlideOver, ValueList, ValueRow } from '@/components/ui';
import type { StatChipTone } from '@/components/ui/statChipTone';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { DeadlineSeverity } from '@/engine/character/severity';
import type { BoardExtractionSource, CorpBoardItem } from '@/engine/corp/board';
import { SystemLink } from '@/features/entities';
import { structureStateLabel } from '@/features/corp/boardSources';
import type { CorpLabel } from '@/features/corp/corpTicker';
import { structureWhen } from '@/features/overview/widgets/data/structureModels';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { formatEveDateTime } from '@/lib/eveTime';
import { formatTimestamp } from '@/lib/timestamp';
import type { StructureRow } from './structureRows';

const TONE: Record<DeadlineSeverity, StatChipTone> = {
  critical: 'danger',
  warning: 'warning',
  watch: 'accent',
  clear: 'default',
};

const SERVICE_TONE: Record<'online' | 'offline' | 'cleanup', StatChipTone> = {
  online: 'default',
  offline: 'danger',
  cleanup: 'warning',
};

export interface StructureDetailProps {
  row: StructureRow | null;
  onClose: () => void;
  corp: CorpLabel | undefined;
  system: SolarSystemEntry | undefined;
  typeName: string | undefined;
  /** The refinery's extraction, when the reader can read extractions and one is running. */
  extraction: BoardExtractionSource | undefined;
}

/** The instant in EVE time, with local time underneath. */
function ClockLines({ ms }: { ms: number }) {
  const { t } = useTranslation();
  const date = new Date(ms);
  return (
    <>
      <span>{t('corp.structures.detail.eveTime', { time: formatEveDateTime(date) })}</span>
      <span className="text-text-dim">
        {t('corp.structures.detail.localTime', { time: formatTimestamp(date) })}
      </span>
    </>
  );
}

function Clock({ ms, lead }: { ms: number | null; lead?: string }) {
  return (
    <span className="flex flex-col items-end">
      {lead !== undefined && <span>{lead}</span>}
      {ms !== null && <ClockLines ms={ms} />}
    </span>
  );
}

/** A clock's countdown, toned by its severity, and when it ends. */
function ClockRow({ label, item }: { label: string; item: CorpBoardItem | undefined }) {
  const { t } = useTranslation();
  if (item === undefined) return null;
  return (
    <ValueRow
      label={label}
      value={<Clock ms={item.deadlineMs} lead={structureWhen(item, t)} />}
      tone={TONE[item.severity]}
    />
  );
}

export function StructureDetail({
  row,
  onClose,
  corp,
  system,
  typeName,
  extraction,
}: StructureDetailProps) {
  const { t } = useTranslation();
  const C = 'corp.structures.col';
  const S = 'overview.widgets.structures.detail.serviceState';
  return (
    <SlideOver
      open={row !== null}
      onClose={onClose}
      title={row?.source.name ?? ''}
      subtitle={typeName}
      contentKey={row?.source.structureId}
    >
      {row && (
        <div className="space-y-4">
          <ValueList>
            {corp && <ValueRow label={t(`${C}.corp`)} value={`${corp.name} [${corp.ticker}]`} />}
            {row.source.systemId !== undefined && (
              <ValueRow
                label={t(`${C}.system`)}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <SystemLink systemId={row.source.systemId}>
                      {system?.name ?? String(row.source.systemId)}
                    </SystemLink>
                    {system && <SecurityStatus security={system.security} />}
                  </span>
                }
              />
            )}
            {row.source.state !== null && (
              <ValueRow label={t(`${C}.state`)} value={structureStateLabel(row.source.state)} />
            )}
            <ClockRow label={t(`${C}.fuel`)} item={row.fuel} />
            <ClockRow label={t(`${C}.timer`)} item={row.timer} />
            <ClockRow label={t(`${C}.unanchoring`)} item={row.unanchor} />
          </ValueList>
          {row.source.services.length > 0 && (
            <section className="space-y-1">
              <Eyebrow>{t('corp.structures.detail.services')}</Eyebrow>
              <ValueList>
                {row.source.services.map((service) => (
                  <ValueRow
                    key={service.name}
                    label={service.name}
                    value={t(`${S}.${service.state}`)}
                    tone={SERVICE_TONE[service.state]}
                  />
                ))}
              </ValueList>
            </section>
          )}
          {extraction && (
            <section className="space-y-1">
              <Eyebrow>{t('corp.structures.detail.moonExtraction')}</Eyebrow>
              <ValueList>
                <ValueRow
                  label={t('corp.structures.detail.chunkArrives')}
                  value={<Clock ms={extraction.chunkArrivalMs} />}
                />
                <ValueRow
                  label={t('corp.structures.detail.naturalDecay')}
                  value={<Clock ms={extraction.naturalDecayMs} />}
                />
              </ValueList>
            </section>
          )}
        </div>
      )}
    </SlideOver>
  );
}
