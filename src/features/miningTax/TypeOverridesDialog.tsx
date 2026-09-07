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
  /** Re-runs the route's snapshot: an untagged id has to flow back through `ledger.ts`'s set construction to reappear as unclassified. Called once, on close, however many tags were removed. */
  onChanged: () => void;
}

interface OverrideRow {
  typeId: number;
  name: string;
}

type ListId = 'moonOre' | 'ignored';

/**
 * The two lists in one table, so `ListId` is discriminated exactly once. Adding
 * a third override list means one entry here, not a third branch in three
 * places.
 */
const LISTS = {
  moonOre: { untag: untagMoonOre, headingKey: 'miningTax.oreTagsMoonOreHeading' },
  ignored: { untag: untagIgnored, headingKey: 'miningTax.oreTagsIgnoredHeading' },
} as const satisfies Record<
  ListId,
  { untag: (typeId: number) => Promise<void>; headingKey: string }
>;

const LIST_IDS = Object.keys(LISTS) as ListId[];

type Rows = Record<ListId, OverrideRow[]>;

const EMPTY_ROWS: Rows = { moonOre: [], ignored: [] };

export function TypeOverridesDialog({ open, onClose, onChanged }: TypeOverridesDialogProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Rows>(EMPTY_ROWS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Whether anything was actually removed. The route's snapshot is a paginated
  // per-character read, so re-running it after every click would put that in
  // front of the table three times for three removals; once on close is the
  // same result for one reload.
  const [changed, setChanged] = useState(false);

  // The route mounts this only while it is open, so one load on mount is the
  // whole lifecycle — `cancelled` guards the unmount that a fast close causes,
  // not a prop change.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { moonOreTypeIds, ignoredTypeIds } = await loadTypeOverrides();
        // One resolve for both lists: `loadTypeNames` batches, and a type
        // tagged in both would otherwise be fetched twice.
        const names = await loadTypeNames([...moonOreTypeIds, ...ignoredTypeIds]);
        if (cancelled) return;
        const toRows = (ids: number[]): OverrideRow[] =>
          ids.map((typeId) => ({ typeId, name: names.get(typeId) ?? `#${typeId}` }));
        setRows({ moonOre: toRows(moonOreTypeIds), ignored: toRows(ignoredTypeIds) });
      } catch {
        // `loadTypeNames` is network-backed. Without this the spinner never
        // stops, which in a dialog whose whole job is recovering from a bad
        // tag is the same dead end it was built to remove.
        if (!cancelled) setError(t('miningTax.oreTagsLoadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function remove(list: ListId, row: OverrideRow) {
    try {
      // Dexie first, then local state: a failed write must not leave the row
      // gone from the dialog but still filtering the ledger behind it.
      await LISTS[list].untag(row.typeId);
      setRows((current) => ({
        ...current,
        [list]: current[list].filter((entry) => entry.typeId !== row.typeId),
      }));
      setChanged(true);
      setError(null);
    } catch {
      setError(t('miningTax.oreTagsRemoveError', { name: row.name }));
    }
  }

  function handleClose() {
    if (changed) onChanged();
    onClose();
  }

  const isEmpty = LIST_IDS.every((list) => rows[list].length === 0);

  return (
    <Modal open={open} onClose={handleClose} title={t('miningTax.oreTagsTitle')}>
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('miningTax.oreTagsHint')}</p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {loading ? (
          <Spinner />
        ) : isEmpty ? (
          <p className="text-xs text-text-dim">{t('miningTax.oreTagsEmpty')}</p>
        ) : (
          LIST_IDS.filter((list) => rows[list].length > 0).map((list) => (
            <div key={list} className="space-y-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t(LISTS[list].headingKey)}
              </p>
              <ul className="divide-y divide-line">
                {rows[list].map((row) => (
                  <li key={row.typeId} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                    <IconButton
                      variant="plain"
                      size="sm"
                      tone="danger"
                      icon={<Icon.Close />}
                      label={t('miningTax.removeOreTagLabel', { name: row.name })}
                      onClick={() => void remove(list, row)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
