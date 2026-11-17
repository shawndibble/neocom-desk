import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  StatChip,
  StatChips,
  TextInput,
  entityLinkClassName,
  type DataTableColumn,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import {
  refineryMonths,
  type ArchiveReason,
  type RefineryMonth,
} from '@/engine/corpTaxBook/moonOwnerRefineries';
import { formatCount } from '@/lib/formatCount';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { setRefineryArchive, setRefineryLabel } from '../taxBook/feederClient';
import { caretColumn } from './caretColumn';
import { callableErrorText } from './feederErrorText';
import { isk, monthLabel, shortDate, shortDateTime } from './moonsFormat';
import { extractionPath, moonOwnerPath, moonPath } from './moonsPaths';
import { Crumb, OreLine, StateWord } from './moonsParts';
import { REFINERY_LABEL_MAX } from './RefineryLabels';
import { offerLabel } from './refineryText';
import { useBook } from './useBook';
import { useOwnerRefineries } from './useOwnerRefineries';

const k = (key: string) => `corpTaxBook.moons.refinery.${key}`;
const kl = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;

/** The pencil beside the title: the label is edited in place, as on the refineries list. */
function TitleEdit({
  name,
  current,
  onSave,
}: {
  name: string;
  current: string;
  onSave: (label: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const { editing, start, triggerRef, failure, inputProps } = useInPlaceEdit({
    initial: () => current,
    onCommit: (draft) => onSave(draft.trim() === '' ? null : draft.trim()),
  });
  const error = failure === undefined ? null : callableErrorText(t, failure, kl('failed'));
  if (editing) {
    return (
      <span className="block space-y-1">
        <TextInput
          size="sm"
          {...inputProps}
          maxLength={REFINERY_LABEL_MAX}
          placeholder={name}
          aria-label={t(kl('field'))}
          aria-describedby={hintId}
          className="w-full max-w-md"
        />
        <span id={hintId} className="block text-xs text-text-dim">
          {t(kl('hint'))}
        </span>
        {error && <InlineError>{error}</InlineError>}
      </span>
    );
  }
  return (
    <IconButton
      ref={triggerRef}
      size="row"
      variant="plain"
      icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
      label={t(k('editLabel'), { name })}
      tooltip={t(kl('editTooltip'))}
      onClick={start}
    />
  );
}

/**
 * A moon owner's refinery page (#6298): its moon, Extractions and mining by month. Archive lives in
 * the header only, and is offered (accent, with a hint) when the structure is gone or idle; an
 * officer may archive by hand any time. Archive hides; it never deletes.
 */
export function RefineryDetail({ ownerId, structureId }: { ownerId: string; structureId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { names, canEdit, characterId, corporationId, reload, data } = useBook();
  const corp = Number(ownerId);
  const refineries = useOwnerRefineries(corp);
  const [confirm, setConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFailure, setRestoreFailure] = useState<unknown>(undefined);
  const row =
    refineries.active.find((r) => r.structureId === structureId) ??
    refineries.archived.find((r) => r.structureId === structureId);
  const crumb = <Crumb to={moonOwnerPath(ownerId)} label={names.corporation(corp)} />;
  if (!row) {
    return (
      <div className="space-y-4">
        {crumb}
        <EmptyState title={t(k('notFound'))} />
      </div>
    );
  }
  const feeder = data.feeders?.find((f) => f.corporationId === corp);
  const ended = feeder?.status === 'left' || feeder?.status === 'removed';
  const mayEdit = canEdit && !ended;
  const name = names.ownerRefinery(structureId);
  const archived = row.archive !== undefined;
  const extractions = refineries.extractions
    .filter((x) => x.structureId === structureId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const months = refineryMonths(refineries.mining, structureId);
  const lastExtraction = extractions
    .map((x) => x.chunkArrivalAt)
    .sort()
    .at(-1);

  const archive = async (reason: ArchiveReason) => {
    try {
      await setRefineryArchive(characterId, corporationId, corp, structureId, true, reason);
    } finally {
      reload();
    }
  };
  const restore = () => {
    setRestoring(true);
    setRestoreFailure(undefined);
    setRefineryArchive(characterId, corporationId, corp, structureId, false)
      .then(reload)
      .catch(setRestoreFailure)
      .finally(() => setRestoring(false));
  };

  const extractionColumns: DataTableColumn<ExtractionRow>[] = [
    {
      id: 'popped',
      header: t(k('cols.popped')),
      primary: true,
      render: (x) => shortDateTime(x.chunkArrivalAt),
      sortValue: (x) => x.chunkArrivalAt,
    },
    {
      id: 'state',
      header: t(k('cols.state')),
      render: (x) => (
        <span className="flex flex-col items-start gap-0.5">
          <StateWord state={x.state} />
          {x.fullyMined && <span className="text-xs text-text-dim">{t(k('fullyMined'))}</span>}
        </span>
      ),
      sortValue: (x) => x.state,
    },
    { id: 'ore', header: t(k('cols.ore')), render: (x) => <OreLine row={x} /> },
    {
      id: 'value',
      header: t(k('cols.value')),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (x) => (x.estimatedValue === null ? '—' : isk(x.estimatedValue)),
      sortValue: (x) => x.estimatedValue ?? undefined,
    },
    caretColumn<ExtractionRow>(),
  ];
  const monthColumns: DataTableColumn<RefineryMonth>[] = [
    {
      id: 'month',
      header: t(k('cols.month')),
      primary: true,
      render: (m) => monthLabel(m.month),
      sortValue: (m) => m.month,
    },
    {
      id: 'miners',
      header: t(k('cols.miners')),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => formatCount(m.miners),
      sortValue: (m) => m.miners,
    },
    {
      id: 'units',
      header: t(k('cols.units')),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => formatCount(m.quantity),
      sortValue: (m) => m.quantity,
    },
    {
      id: 'value',
      header: t(k('cols.mined')),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.value),
      sortValue: (m) => m.value,
    },
  ];
  const labelEdit =
    mayEdit && !archived ? (
      <TitleEdit
        name={name}
        current={feeder?.refineryLabels?.[String(structureId)]?.label ?? ''}
        onSave={async (label) => {
          await setRefineryLabel(characterId, corporationId, corp, structureId, label);
          reload();
        }}
      />
    ) : undefined;

  return (
    <div className="space-y-4">
      {crumb}
      <PageHeader
        title={name}
        meta={archived ? <Pill>{t(k('archivedPill'))}</Pill> : labelEdit}
        actions={
          mayEdit ? (
            archived ? (
              <Button loading={restoring} onClick={restore}>
                <Icon.Revert size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {t(k('restore'))}
              </Button>
            ) : (
              <Button variant={row.offer ? 'accent' : 'ghost'} onClick={() => setConfirm(true)}>
                {t(k('archive'))}
              </Button>
            )
          ) : undefined
        }
      />
      {restoreFailure !== undefined && (
        <InlineError>{callableErrorText(t, restoreFailure, k('failed'))}</InlineError>
      )}
      {row.offer && (
        <Panel>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 basis-64 text-sm">
              {row.offer.kind === 'gone'
                ? t(k('hintGone'))
                : row.lastMinedOn
                  ? t(k('hintIdle'), { count: row.offer.days, date: shortDate(row.lastMinedOn) })
                  : t(k('hintIdleNever'), { count: row.offer.days })}
            </p>
            <Pill tone="warning">{offerLabel(t, row.offer)}</Pill>
          </div>
        </Panel>
      )}
      {row.archive && (
        <Panel>
          <p className="text-sm">
            {t(k('archivedBanner'), {
              date: shortDate(new Date(row.archive.at).toISOString()),
              name: names.character(row.archive.by),
              why: t(kl(`archived.why.${row.archive.reason}`)),
            })}
          </p>
        </Panel>
      )}
      <Panel>
        <StatChips>
          <StatChip
            label={t(k('facts.moon'))}
            value={
              row.moonId === undefined ? (
                '—'
              ) : (
                <Link to={moonPath(row.moonId)} className={entityLinkClassName()}>
                  {names.moon(row.moonId)}
                </Link>
              )
            }
          />
          <StatChip label={t(k('facts.extractions'))} value={formatCount(row.extractionCount)} />
          <StatChip
            label={t(k('facts.lastExtraction'))}
            value={lastExtraction ? shortDate(lastExtraction) : '—'}
          />
          <StatChip label={t(k('facts.mined'))} value={isk(row.mined)} />
        </StatChips>
      </Panel>
      <Panel title={t(k('extractionsTitle'))} padded={false}>
        {extractions.length === 0 ? (
          <p className="p-3 text-sm text-text-dim">{t(k('extractionsNone'))}</p>
        ) : (
          <DataTable
            label={t(k('extractionsTitle'))}
            columns={extractionColumns}
            rows={extractions}
            rowKey={(x) => x.id}
            onRowClick={(x) => navigate(extractionPath(x.id))}
            defaultSort={{ columnId: 'popped', direction: 'desc' }}
            mobileSort
            stackColumns={2}
          />
        )}
      </Panel>
      <Panel title={t(k('historyTitle'))} padded={false}>
        {months.length === 0 ? (
          <p className="p-3 text-sm text-text-dim">{t(k('historyNone'))}</p>
        ) : (
          <DataTable
            label={t(k('historyTitle'))}
            columns={monthColumns}
            rows={months}
            rowKey={(m) => m.month}
            defaultSort={{ columnId: 'month', direction: 'desc' }}
            mobileSort
            stackColumns={2}
          />
        )}
      </Panel>
      <ConfirmDialog
        open={confirm}
        danger={false}
        title={t(k('confirm.title'), { name })}
        body={t(k('confirm.body'))}
        actionLabel={t(k('confirm.action'))}
        cancelLabel={t('common.cancel')}
        failedLabel={t(k('failed'))}
        onConfirm={() => archive(row.offer?.kind ?? 'manual')}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
