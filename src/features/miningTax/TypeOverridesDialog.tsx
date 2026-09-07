/**
 * Review and undo the manual ore tags the "unclassified ore" banner writes
 * (`typeOverrides.ts`).
 *
 * This exists because the banner is the only thing that could reach those
 * lists, and the banner renders only while something is still unclassified —
 * so the moment a pilot tags the last id, the tags become invisible and
 * permanent. Tagging a genuine moon-ore type as "Ignore" then drops it out of
 * the ledger silently, and the ISK it represents with it.
 *
 * Deliberately plain: two lists and a remove button each. There is nothing to
 * edit — a tag is one id in one list — so this is not `PayeeManagerDialog`'s
 * create/edit/delete manager, just the missing inverse of two actions.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Modal, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadTypeOverrides, untagIgnored, untagMoonOre } from './typeOverrides';

interface TypeOverridesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Re-runs the route's snapshot: an untagged id has to flow back through `ledger.ts`'s set construction to reappear as unclassified. */
  onChanged: () => void;
}

interface OverrideRow {
  typeId: number;
  name: string;
}

type Lists = { moonOre: OverrideRow[]; ignored: OverrideRow[] };

const EMPTY_LISTS: Lists = { moonOre: [], ignored: [] };

export function TypeOverridesDialog({ open, onClose, onChanged }: TypeOverridesDialogProps) {
  const { t } = useTranslation();
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS);
  const [loading, setLoading] = useState(true);

  // The route mounts this only while it is open, so one load on mount is the
  // whole lifecycle — `cancelled` guards the unmount that a fast close causes,
  // not a prop change.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { moonOreTypeIds, ignoredTypeIds } = await loadTypeOverrides();
      // One resolve for both lists: `loadTypeNames` batches, and a type tagged
      // in both would otherwise be fetched twice.
      const names = await loadTypeNames([...moonOreTypeIds, ...ignoredTypeIds]);
      if (cancelled) return;
      const toRows = (ids: number[]): OverrideRow[] =>
        ids.map((typeId) => ({ typeId, name: names.get(typeId) ?? `#${typeId}` }));
      setLists({ moonOre: toRows(moonOreTypeIds), ignored: toRows(ignoredTypeIds) });
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(list: keyof Lists, row: OverrideRow) {
    // Dexie first, then local state: a failed write must not leave the row
    // gone from the dialog but still filtering the ledger behind it.
    await (list === 'moonOre' ? untagMoonOre(row.typeId) : untagIgnored(row.typeId));
    setLists((current) => ({
      ...current,
      [list]: current[list].filter((entry) => entry.typeId !== row.typeId),
    }));
    onChanged();
  }

  const isEmpty = lists.moonOre.length === 0 && lists.ignored.length === 0;

  function renderList(list: keyof Lists, rows: OverrideRow[], headingKey: string) {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t(headingKey)}
        </p>
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.typeId} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
              <IconButton
                variant="plain"
                size="sm"
                tone="danger"
                icon={<Icon.Close />}
                label={t('miningTax.removeOreTag', { name: row.name })}
                onClick={() => void remove(list, row)}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.oreTagsTitle')}>
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('miningTax.oreTagsHint')}</p>
        {loading ? (
          <Spinner />
        ) : isEmpty ? (
          <p className="text-xs text-text-dim">{t('miningTax.oreTagsEmpty')}</p>
        ) : (
          <>
            {renderList('moonOre', lists.moonOre, 'miningTax.oreTagsMoonOreHeading')}
            {renderList('ignored', lists.ignored, 'miningTax.oreTagsIgnoredHeading')}
          </>
        )}
      </div>
    </Modal>
  );
}
