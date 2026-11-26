import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { InlineError } from '@/components/ui/InlineError';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Modal, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { loadTypeNames } from '@/features/character/typeNames';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { loadTypeOverrides, untagIgnored, untagMoonOre } from './typeOverrides';

interface TypeOverridesDialogProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

interface OverrideRow {
  typeId: number;
  name: string;
}

type ListId = 'moonOre' | 'ignored';

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
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { moonOreTypeIds, ignoredTypeIds } = await loadTypeOverrides();
        const names = await loadTypeNames([...moonOreTypeIds, ...ignoredTypeIds]);
        if (cancelled) return;
        const toRows = (ids: number[]): OverrideRow[] =>
          ids.map((typeId) => ({ typeId, name: names.get(typeId) ?? `#${typeId}` }));
        setRows({ moonOre: toRows(moonOreTypeIds), ignored: toRows(ignoredTypeIds) });
      } catch {
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
    <Modal
      open={open}
      onClose={handleClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.oreTagsTitle')}
    >
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('miningTax.oreTagsHint')}</p>
        {error && <InlineError>{error}</InlineError>}
        {loading ? (
          <Spinner />
        ) : isEmpty ? (
          <p className="text-xs text-text-dim">{t('miningTax.oreTagsEmpty')}</p>
        ) : (
          LIST_IDS.filter((list) => rows[list].length > 0).map((list) => (
            <div key={list} className="space-y-1">
              <p className={eyebrowClassName}>{t(LISTS[list].headingKey)}</p>
              <ul className="divide-y divide-line">
                {rows[list].map((row) => (
                  <li key={row.typeId} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <MarketItemLink typeId={row.typeId}>{row.name}</MarketItemLink>
                    </span>
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
