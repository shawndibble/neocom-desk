import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, CollapsiblePanel, entityLinkClassName } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import * as Icon from '@/components/ui/icons';
import type { RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { cx } from '@/lib/cx';
import { callableErrorText } from './feederErrorText';
import { atDate } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.refineryLabels.archived.${key}`;

function ArchivedRow({
  row,
  name,
  to,
  moonName,
  byName,
  onRestore,
}: {
  row: RefineryRow;
  name: string;
  to: string;
  moonName: string | undefined;
  byName: string;
  onRestore?: () => Promise<void>;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(undefined);
  const archive = row.archive!;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="min-w-0 flex-1 basis-56">
        <Link to={to} className={cx(entityLinkClassName(), 'text-sm [overflow-wrap:anywhere]')}>
          {name}
        </Link>
        <p className="text-xs text-text-dim">
          {[
            t(k('row'), {
              date: atDate(archive.at, zone),
              name: byName,
              why: t(k(`why.${archive.reason}`)),
            }),
            ...(moonName ? [moonName] : []),
          ].join(' · ')}
        </p>
        {failure !== undefined && (
          <InlineError>{callableErrorText(t, failure, k('restoreFailed'))}</InlineError>
        )}
      </div>
      {onRestore && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy}
          aria-label={t(k('restoreLabel'), { name })}
          onClick={() => {
            setBusy(true);
            setFailure(undefined);
            onRestore()
              .catch(setFailure)
              .finally(() => setBusy(false));
          }}
        >
          <Icon.Revert size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t(k('restore'))}
        </Button>
      )}
    </li>
  );
}

export function ArchivedRefineries({
  rows,
  name,
  moonName,
  pathOf,
  byName,
  onRestore,
  canRestore,
}: {
  rows: readonly RefineryRow[];
  name: (structureId: number) => string;
  moonName: (row: RefineryRow) => string | undefined;
  pathOf: (structureId: number) => string;
  byName: (characterId: number) => string;
  onRestore?: (structureId: number) => Promise<void>;
  canRestore?: (structureId: number) => boolean;
}) {
  const { t } = useTranslation();
  const [toggled, setToggled] = useState<boolean>();
  const open = toggled ?? rows.length === 0;
  if (rows.length === 0 && !onRestore) return null;
  return (
    <CollapsiblePanel
      title={t(k('title'), { count: rows.length })}
      expanded={open}
      onToggle={() => setToggled(!open)}
      labels={{ show: t(k('show')), hide: t(k('hide')) }}
      padded={false}
    >
      {rows.length === 0 ? (
        <p className="p-3 text-sm text-text-dim">{t(k('empty'))}</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...rows]
            .sort((a, b) => name(a.structureId).localeCompare(name(b.structureId)))
            .map((row) => (
              <ArchivedRow
                key={row.structureId}
                row={row}
                name={name(row.structureId)}
                to={pathOf(row.structureId)}
                moonName={moonName(row)}
                byName={byName(row.archive!.by)}
                {...(onRestore && (canRestore?.(row.structureId) ?? true)
                  ? { onRestore: () => onRestore(row.structureId) }
                  : {})}
              />
            ))}
        </ul>
      )}
    </CollapsiblePanel>
  );
}
