import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  LoadFailedState,
  Panel,
  Spinner,
  Toast,
  ToastStack,
  useDeferredCommits,
  type DataTableColumn,
} from '@/components/ui';
import { textActionClassName } from '@/components/ui';
import type { DoctrineFit, SaveDoctrineInput } from '../srpTypes';
import { AddDoctrineDialog, type DoctrineSource } from './AddDoctrineDialog';
import { formatIskCompact } from '@/lib/isk';
import { useDoctrineCoverage } from './useDoctrineCoverage';
import { useDoctrineTypeNames } from './useDoctrineTypeNames';
import type { DoctrinesState } from './useSrpDoctrines';

interface Props {
  state: DoctrinesState;
  characterId: number;
  onAdd: (input: SaveDoctrineInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRetry: () => void;
  onAdded: (hullTypeId: number) => void;
}

export function DoctrineFitsPanel({
  state,
  characterId,
  onAdd,
  onRemove,
  onRetry,
  onAdded,
}: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<DoctrineSource | null>(null);
  const pendingDeletes = useDeferredCommits();
  const [toast, setToast] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const allFits = state.status === 'ready' ? state.fits : [];
  const { hiddenIds } = pendingDeletes;
  const fits = hiddenIds.size === 0 ? allFits : allFits.filter((f) => !hiddenIds.has(f.id));
  const coverage = useDoctrineCoverage(fits);
  const coverages = new Map(fits.map((f) => [f.id, coverage.coverageOf(f)]));
  const typeName = useDoctrineTypeNames([
    ...fits.map((f) => f.snapshot.hullTypeId),
    ...[...coverages.values()].flatMap((c) => (c ? [c.shortOn] : [])),
  ]);

  const open = (source: DoctrineSource, el: HTMLElement) => {
    triggerRef.current = el;
    setAdding(source);
  };

  const columns: DataTableColumn<DoctrineFit>[] = [
    {
      id: 'name',
      header: t('srp.settings.doctrines.name'),
      render: (f) => <span className="font-semibold">{f.name}</span>,
    },
    {
      id: 'hull',
      header: t('srp.settings.doctrines.hull'),
      render: (f) => typeName(f.snapshot.hullTypeId),
    },
    {
      id: 'contents',
      header: t('srp.settings.doctrines.contents'),
      className: 'text-text-dim',
      render: (f) =>
        t('srp.settings.doctrines.contentsValue', {
          modules: f.snapshot.modules.length,
          rigs: f.snapshot.rigs.length,
        }),
    },
    {
      id: 'coverage',
      header: t('srp.settings.doctrines.coverage', { hub: coverage.hub.systemName }),
      className: 'text-text-dim',
      render: (f) => {
        const c = coverages.get(f.id);
        if (!c) return coverage.loading ? t('common.loading') : null;
        const name = typeName(c.shortOn);
        const args = {
          ships: t('srp.settings.doctrines.coverageShips', { count: c.ships }),
          short: t(
            c.unlisted.includes(c.shortOn)
              ? 'srp.settings.doctrines.coverageUnlisted'
              : 'srp.settings.doctrines.coverageShort',
            { name }
          ),
          isk: formatIskCompact(c.nextShipListedCost),
        };
        return t(
          c.nextShipListedCost > 0
            ? 'srp.settings.doctrines.coverageLineNext'
            : 'srp.settings.doctrines.coverageLine',
          args
        );
      },
    },
    {
      id: 'delete',
      header: '',
      align: 'right',
      render: (f) => (
        <button
          type="button"
          className={textActionClassName()}
          aria-label={t('srp.settings.doctrines.deleteLabel', { name: f.name })}
          onClick={() =>
            pendingDeletes.defer({
              id: f.id,
              message: t('srp.settings.doctrines.deleted', { name: f.name }),
              commit: () => onRemove(f.id),
            })
          }
        >
          {t('srp.settings.doctrines.delete')}
        </button>
      ),
    },
  ];

  let body;
  if (state.status === 'loading') body = <Spinner label={t('common.loading')} />;
  else if (state.status === 'failed')
    body = <LoadFailedState title={t('srp.settings.doctrines.loadFailed')} onRetry={onRetry} />;
  else if (fits.length === 0) body = <EmptyState title={t('srp.settings.doctrines.empty')} />;
  else
    body = (
      <DataTable
        label={t('srp.settings.doctrines.tableLabel')}
        columns={columns}
        rows={fits}
        rowKey={(f) => f.id}
        stackColumns={1}
      />
    );

  return (
    <Panel
      title={t('srp.settings.doctrines.title')}
      meta={t('srp.settings.doctrines.meta')}
      wrapMeta
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2 max-sm:[&>button]:w-full">
          <Button onClick={(e) => open('fitting', e.currentTarget)}>
            {t('srp.settings.doctrines.fromFitting')}
          </Button>
          <Button onClick={(e) => open('eft', e.currentTarget)}>
            {t('srp.settings.doctrines.fromEft')}
          </Button>
        </div>
        {body}
      </div>
      {adding && (
        <AddDoctrineDialog
          source={adding}
          characterId={characterId}
          onAdd={async (input) => {
            await onAdd(input);
            onAdded(input.snapshot.hullTypeId);
            setToast(t('srp.settings.doctrines.added', { name: input.name }));
          }}
          onClose={() => setAdding(null)}
        />
      )}
      <ToastStack
        items={pendingDeletes.items}
        undoLabel={t('srp.settings.doctrines.undo')}
        onUndo={pendingDeletes.undo}
        onClose={pendingDeletes.commit}
      />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </Panel>
  );
}
