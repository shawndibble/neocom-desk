/**
 * Edits the implant/booster set a Fitting carries.
 *
 * Adds by exact (case-insensitive) item name via the same `loadItemNameMap`
 * the EFT loader resolves names through — there is no per-slot SDE attribute
 * baked into this build's snapshot to drive a "browse implant slot 3" style
 * picker, so this trims to a name-search add/remove list instead.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Modal, SearchInput, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { MAX_BOOSTERS, MAX_IMPLANTS } from '@/engine/fitting/fittingShare';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypeNames } from '@/features/character/typeNames';

interface ImplantSetPickerProps {
  open: boolean;
  onClose: () => void;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
}

/** Stable identity: a fresh `{implants: [], boosters: []}` every render would
 * re-fire the name-resolve effect below every render whenever no set is
 * carried yet — the common case for a freshly-loaded Fitting. */
const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

interface SlotListProps {
  heading: string;
  typeIds: readonly number[];
  max: number;
  names: Map<number, string>;
  onAdd: (name: string) => void;
  /** By position, not type id — a set may legally carry the same id twice. */
  onRemove: (index: number) => void;
  error: string | null;
}

function SlotList({ heading, typeIds, max, names, onAdd, onRemove, error }: SlotListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const full = typeIds.length >= max;

  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {heading}
      </p>
      {typeIds.length === 0 ? (
        <p className="text-sm text-text-dim">{t('fittings.implants.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {typeIds.map((typeId, index) => {
            const name = names.get(typeId) ?? t('fittings.implants.unknownType', { typeId });
            return (
              <li
                key={`${typeId}-${index}`} // ids may repeat — see onRemove's own doc
                className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5"
              >
                <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                <span className="flex-1 truncate text-sm">{name}</span>
                <IconButton
                  variant="plain"
                  size="sm"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={t('fittings.implants.remove', { name })}
                  onClick={() => onRemove(index)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim() === '') return;
          onAdd(query.trim());
          setQuery('');
        }}
      >
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('fittings.implants.addPlaceholder')}
          disabled={full}
          aria-label={heading}
        />
        <Button type="submit" size="sm" disabled={full || query.trim() === ''}>
          {t('fittings.implants.add')}
        </Button>
      </form>
      {full && <p className="text-xs text-warning">{t('fittings.implants.full')}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ImplantSetPicker({ open, onClose, implantSet, onChange }: ImplantSetPickerProps) {
  const { t } = useTranslation();
  const [nameMap, setNameMap] = useState<Map<string, { typeID: number }>>(new Map());
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [implantError, setImplantError] = useState<string | null>(null);
  const [boosterError, setBoosterError] = useState<string | null>(null);

  const set = implantSet ?? EMPTY_SET;

  useEffect(() => {
    if (!open) return;
    void loadItemNameMap().then(setNameMap);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadTypeNames([...set.implants, ...set.boosters]).then(setNames);
  }, [open, set.implants, set.boosters]);

  function addTo(kind: 'implants' | 'boosters', rawName: string) {
    const entry = nameMap.get(rawName.toLowerCase());
    const setError = kind === 'implants' ? setImplantError : setBoosterError;
    if (!entry) {
      setError(t('fittings.implants.notFound'));
      return;
    }
    setError(null);
    void onChange({ ...set, [kind]: [...set[kind], entry.typeID] });
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    void onChange({ ...set, [kind]: set[kind].filter((_, i) => i !== index) });
  }

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')}>
      <div className="space-y-4 p-3">
        <SlotList
          heading={t('fittings.implants.implantsHeading')}
          typeIds={set.implants}
          max={MAX_IMPLANTS}
          names={names}
          onAdd={(name) => addTo('implants', name)}
          onRemove={(index) => removeFrom('implants', index)}
          error={implantError}
        />
        <SlotList
          heading={t('fittings.implants.boostersHeading')}
          typeIds={set.boosters}
          max={MAX_BOOSTERS}
          names={names}
          onAdd={(name) => addTo('boosters', name)}
          onRemove={(index) => removeFrom('boosters', index)}
          error={boosterError}
        />
      </div>
    </Modal>
  );
}
