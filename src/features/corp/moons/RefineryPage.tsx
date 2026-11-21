import { useMemo, useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  StatChip,
  StatChips,
  entityLinkClassName,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { refineryRows, type ArchiveReason } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { withMoonDocs } from '@/engine/corpTaxBook/pullFigures';
import { minedPullCount, oreValue, refineryMiners } from '@/engine/corpTaxBook/refineryDocs';
import { newestFirst, popBounds, refineryExtractions } from '@/engine/corpTaxBook/refineryList';
import { utcDay } from '@/engine/localDay';
import { formatCount } from '@/lib/formatCount';
import { setRefineryArchive, setRefineryLabel } from '../taxBook/feederClient';
import { callableErrorText } from './feederErrorText';
import { atDate, isk, shortDate, shortDateTime } from './moonsFormat';
import { extractionPath, moonOwnerPath, refineriesTabPath } from './moonsPaths';
import { Crumb } from './moonsParts';
import { MoonRate } from './MoonRate';
import { ExtractionsPanel, MinersPanel, OrePanel, type PullRow } from './refineryPageParts';
import { RefineryTitleEdit } from './RefineryTitleEdit';
import { offerLabel } from './refineryText';
import { UndockableChip } from './sectionParts';
import { useBook } from './useBook';
import { useRefineryList } from './useRefineryList';

const k = (key: string) => `corpTaxBook.moons.refinery.${key}`;
const kl = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;
const kp = (key: string) => `corpTaxBook.moons.refineryPage.${key}`;

/**
 * A refinery's page (#6348): its moon, owner, ore, every Extraction and every Miner, one page for
 * the book's own refineries and moon owners'. It reads the refinery's moon docs, never the ledger,
 * so mining outside an Extraction's window is not counted. Archive lives in the header of a moon
 * owner's refinery only, and is offered (accent, with a hint) when the structure is gone or idle;
 * an officer may archive by hand any time. Archive hides; it never deletes.
 */
export function RefineryPage({ structureId }: { structureId: number }) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { view, names, data, canEdit, characterId, corporationId, reload, refinery } = useBook();
  const [confirm, setConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFailure, setRestoreFailure] = useState<unknown>(undefined);

  const own = useMemo(
    () => refineryExtractions(view.extractions, structureId),
    [view.extractions, structureId]
  );
  const key = String(structureId);
  // The Refineries list owns which refineries exist, who owns them and whether one is archived.
  const list = useRefineryList();
  const listed = list.active.find((r) => r.structureId === structureId);
  const listedArchived = list.archived.find((r) => r.row.structureId === structureId);
  // A refinery with no Extraction yet still belongs to the moon owner whose record names it.
  const ownerId =
    listed?.ownerId ??
    listedArchived?.ownerId ??
    own[0]?.sourceCorporationId ??
    data.feeders?.find(
      (f) => f.refineryStructures?.[key] ?? f.refineryLabels?.[key] ?? f.refineryArchive?.[key]
    )?.corporationId;
  const feeder =
    ownerId === undefined ? undefined : data.feeders?.find((f) => f.corporationId === ownerId);
  const docs = useMemo(
    () => [...(refinery?.docs.values() ?? [])].filter((d) => d.structureId === structureId),
    [refinery, structureId]
  );
  const today = utcDay(Date.parse(view.input.now));
  const priceOf = (typeId: number) => view.input.pricesOn(today).prices.get(typeId) ?? 0;
  const rows = useMemo(
    () =>
      withMoonDocs(
        view,
        new Map(docs.map((d) => [d.extractionId, d])),
        new Set(docs.map((d) => d.extractionId))
      )
        .extractions.filter((x) => x.structureId === structureId)
        .sort(newestFirst),
    [view, docs, structureId]
  );
  const crumb = <Crumb to={refineriesTabPath} label={t('corpTaxBook.moons.tabs.refineries')} />;
  const known =
    listed !== undefined ||
    listedArchived !== undefined ||
    own.length > 0 ||
    ownerId !== undefined ||
    docs.length > 0;
  if (!known) {
    return (
      <div className="space-y-4">
        {crumb}
        <EmptyState title={t(kp('notFound'))} />
      </div>
    );
  }

  const name =
    ownerId === undefined ? names.refinery(structureId) : names.ownerRefinery(structureId);
  const moonId = rows[0]?.moonId;
  const place = splitPlace(name, moonId === undefined ? undefined : names.moon(moonId));
  const title = place.moon === undefined ? name : place.station;
  // A refinery the list does not hold (a moon owner's record names it, nothing else does) has no
  // mining to age, so its state is read from the record alone.
  const row =
    listed?.row ??
    listedArchived?.row ??
    refineryRows({
      now: view.input.now,
      structureIds: [structureId],
      extractions: rows,
      mining: [],
      isGone: () => feeder?.refineryStructures?.[key]?.denied === true,
      ...(feeder?.refineryArchive ? { archive: feeder.refineryArchive } : {}),
    }).active[0];
  const archived = row?.archive !== undefined;
  const ended = feeder?.status === 'left' || feeder?.status === 'removed';
  const mayArchive = ownerId !== undefined && canEdit && !ended;

  const pulls: PullRow[] = rows.map((x) => {
    const doc = docs.find((d) => d.extractionId === x.id);
    return { row: x, minedIsk: doc ? oreValue(doc.mined, priceOf) : null };
  });
  const minedTotal = pulls.reduce((sum, p) => sum + (p.minedIsk ?? 0), 0);
  const taxTotal = rows.reduce((sum, x) => sum + x.tax, 0);
  const { nextPopAt: nextPop, lastPopAt: lastPop } = popBounds(rows);
  const miners = refineryMiners(docs, priceOf);
  const minerName = (minerId: string) => {
    const main = view.input.miners.find((m) => m.id === minerId)?.mainCharacterId;
    const solo = /^solo:(\d+)$/.exec(minerId);
    return names.character(main ?? (solo ? Number(solo[1]) : 0));
  };

  const archive = async (reason: ArchiveReason) => {
    try {
      await setRefineryArchive(characterId, corporationId, ownerId!, structureId, true, reason);
    } finally {
      reload();
    }
  };
  const restore = () => {
    setRestoring(true);
    setRestoreFailure(undefined);
    setRefineryArchive(characterId, corporationId, ownerId!, structureId, false)
      .then(reload)
      .catch(setRestoreFailure)
      .finally(() => setRestoring(false));
  };

  const owner =
    ownerId === undefined ? (
      <span>{t(kp('ownerOurs'), { name: names.corporation(corporationId) })}</span>
    ) : (
      <Link to={moonOwnerPath(String(ownerId))} className={entityLinkClassName()}>
        {names.corporation(ownerId)}
      </Link>
    );

  return (
    <div className="space-y-4">
      {crumb}
      <PageHeader
        title={title}
        meta={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-dim">
            {archived && <Pill>{t(k('archivedPill'))}</Pill>}
            {mayArchive && !archived && (
              <RefineryTitleEdit
                name={name}
                current={feeder?.refineryLabels?.[key]?.label ?? ''}
                onSave={async (label) => {
                  await setRefineryLabel(characterId, corporationId, ownerId!, structureId, label);
                  reload();
                }}
              />
            )}
            <span>{moonId === undefined ? t(kp('moonUnknown')) : names.moon(moonId)}</span>
            {names.undockable?.(structureId) && <UndockableChip />}
            <span aria-hidden="true">·</span>
            {owner}
          </span>
        }
        actions={
          mayArchive ? (
            archived ? (
              <Button loading={restoring} onClick={restore}>
                <Icon.Revert size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {t(k('restore'))}
              </Button>
            ) : (
              <Button variant={row?.offer ? 'accent' : 'ghost'} onClick={() => setConfirm(true)}>
                {t(k('archive'))}
              </Button>
            )
          ) : undefined
        }
      />
      {restoreFailure !== undefined && (
        <InlineError>{callableErrorText(t, restoreFailure, k('failed'))}</InlineError>
      )}
      {ownerId !== undefined && row?.offer && (
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
      {row?.archive && (
        <Panel>
          <p className="text-sm">
            {t(k('archivedBanner'), {
              date: atDate(row.archive.at, zone),
              name: names.character(row.archive.by),
              why: t(kl(`archived.why.${row.archive.reason}`)),
            })}
          </p>
        </Panel>
      )}
      <StatChips>
        <StatChip label={t(kp('facts.extractions'))} value={formatCount(rows.length)} />
        {nextPop && (
          <StatChip label={t(kp('facts.nextPop'))} value={shortDateTime(nextPop, zone)} />
        )}
        {lastPop && (
          <StatChip label={t(kp('facts.lastPop'))} value={shortDateTime(lastPop, zone)} />
        )}
        <StatChip
          label={t(kp('facts.mined'))}
          value={minedTotal ? isk(minedTotal) : '—'}
          emphasis
          tooltip={t(kp('facts.minedTip'))}
          tooltipGlyph="info"
        />
        <StatChip
          label={t(kp('facts.tax'))}
          value={taxTotal ? isk(taxTotal) : '—'}
          tooltip={t(kp('facts.taxTip'))}
          tooltipGlyph="info"
        />
      </StatChips>
      <MoonRate target={{ structureId, ...(moonId !== undefined ? { moonId } : {}) }} />
      {rows[0] && <OrePanel row={rows[0]} priceOf={priceOf} />}
      <ExtractionsPanel pulls={pulls} onOpen={(id) => navigate(extractionPath(id))} />
      <MinersPanel
        miners={miners}
        pulled={minedPullCount(docs)}
        nameOf={minerName}
        nextPop={nextPop}
      />
      {ownerId !== undefined && (
        <ConfirmDialog
          open={confirm}
          danger={false}
          title={t(k('confirm.title'), { name })}
          body={t(k('confirm.body'))}
          actionLabel={t(k('confirm.action'))}
          cancelLabel={t('common.cancel')}
          failedLabel={t(k('failed'))}
          onConfirm={() => archive(row?.offer?.kind ?? 'manual')}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
