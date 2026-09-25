import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, IconButton, Modal, Panel, SearchInput, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { db, type FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { filterMyFittings, groupByHull, type MyFittingRow } from '@/engine/fittings/myFittings';
import { loadTypes } from '@/sde/loadSde';
import { deleteFitting, renameFitting } from './myFittings';

interface MyFittingsPanelProps {
  characterId: number | null;
  /** Opens a saved Fitting in the editor. */
  onOpen: (record: FittingRecord) => void;
}

/** Each saved code's hull name; null when the code no longer decodes. */
function useHullNames(records: readonly FittingRecord[] | undefined): Map<string, string | null> {
  const [hulls, setHulls] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    if (!records) return;
    let cancelled = false;
    void (async () => {
      const types = await loadTypes();
      const next = new Map<string, string | null>();
      for (const record of records) {
        const decoded = await decodeFittingShare(record.code);
        next.set(
          record.id,
          decoded.ok
            ? (types[String(decoded.value.hullTypeId)]?.name ?? `Type ${decoded.value.hullTypeId}`)
            : null
        );
      }
      if (!cancelled) setHulls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [records]);
  return hulls;
}

/** The saved Fittings, grouped by hull and searchable; click one to open it. */
export function MyFittingsPanel({ characterId, onOpen }: MyFittingsPanelProps) {
  const { t } = useTranslation();
  const records = useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  const hulls = useHullNames(records);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<FittingRecord | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<FittingRecord | null>(null);

  const groups = useMemo(() => {
    const rows: (MyFittingRow & { record: FittingRecord })[] = (records ?? [])
      // A row whose hull is still decoding is left out rather than flashed
      // under "Unknown hull".
      .filter((record) => hulls.has(record.id))
      .map((record) => ({
        id: record.id,
        name: record.name,
        hull: hulls.get(record.id) ?? null,
        record,
      }));
    return groupByHull(filterMyFittings(rows, query));
  }, [records, hulls, query]);

  if (characterId === null) return null;
  const total = records?.length ?? 0;

  return (
    <Panel title={t('fittings.myFittings.title')}>
      <div className="space-y-3">
        {total === 0 ? (
          <p className="text-xs text-text-dim">{t('fittings.myFittings.empty')}</p>
        ) : (
          <>
            <SearchInput
              aria-label={t('fittings.myFittings.searchLabel')}
              placeholder={t('fittings.myFittings.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {groups.length === 0 && hulls.size > 0 && (
              <p className="text-xs text-text-dim">{t('fittings.myFittings.noMatches')}</p>
            )}
            {groups.map((group) => (
              <section key={group.hull ?? ''} className="space-y-1">
                <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                  {group.hull ?? t('fittings.myFittings.unknownHull')}
                </h3>
                <ul className="divide-y divide-line">
                  {group.rows.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 py-1">
                      <button
                        type="button"
                        className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-text hover:text-accent"
                        aria-label={t('fittings.myFittings.open', { name: row.name })}
                        onClick={() => onOpen(row.record)}
                      >
                        {row.name}
                      </button>
                      <IconButton
                        size="sm"
                        icon={<Icon.Rename />}
                        label={t('fittings.myFittings.rename', { name: row.name })}
                        tooltip={t('fittings.myFittings.confirmRename')}
                        onClick={() => {
                          setRenaming(row.record);
                          setRenameText(row.name);
                        }}
                      />
                      <IconButton
                        size="sm"
                        tone="danger"
                        icon={<Icon.Close />}
                        label={t('fittings.myFittings.delete', { name: row.name })}
                        tooltip={t('fittings.myFittings.confirmDelete')}
                        onClick={() => setDeleting(row.record)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('fittings.myFittings.confirmRename')}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = renameText.trim();
            if (renaming && name !== '') void renameFitting(renaming, name);
            setRenaming(null);
          }}
        >
          <label className="block text-xs text-text-dim" htmlFor="my-fitting-rename">
            {t('fittings.myFittings.renameLabel')}
          </label>
          <TextInput
            id="my-fitting-rename"
            className="w-full"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRenaming(null)}>{t('fittings.myFittings.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={renameText.trim() === ''}>
              {t('fittings.myFittings.confirmRename')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('fittings.myFittings.confirmDelete')}
      >
        <div className="space-y-3">
          <p className="text-sm text-text">
            {t('fittings.myFittings.deleteConfirm', { name: deleting?.name ?? '' })}
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>{t('fittings.myFittings.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) void deleteFitting(deleting);
                setDeleting(null);
              }}
            >
              {t('fittings.myFittings.confirmDelete')}
            </Button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
