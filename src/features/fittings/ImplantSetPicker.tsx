/**
 * Edits the implant/booster set a Fitting carries (issue #1535, scope
 * decision `20260924-150509-fittings-section-a-fitter-after-all.md`: "The set
 * is edited from a picker in the Fitting's header").
 *
 * Adds by exact (case-insensitive) item name via the same `loadItemNameMap`
 * the EFT loader resolves names through — there is no per-slot SDE attribute
 * baked into this build's snapshot to drive a "browse implant slot 3" style
 * picker, so this trims to a name-search add/remove list instead. Each add or
 * remove writes straight through `onChange`, which the caller wires to
 * `useFittingWorkspace`'s `setImplantSet` — live, like every other edit this
 * workspace makes.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, SearchInput, TypeIcon } from '@/components/ui';
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

function emptySet(): FittingImplantSet {
  return { implants: [], boosters: [] };
}

interface SlotListProps {
  heading: string;
  typeIds: readonly number[];
  max: number;
  names: Map<number, string>;
  onAdd: (name: string) => void;
  onRemove: (typeId: number) => void;
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
          {typeIds.map((typeId) => (
            <li key={typeId} className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
              <TypeIcon typeId={typeId} size={32} width={20} height={20} />
              <span className="flex-1 truncate text-sm">
                {names.get(typeId) ?? `Type #${typeId}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('fittings.implants.remove', {
                  name: names.get(typeId) ?? `Type #${typeId}`,
                })}
                onClick={() => onRemove(typeId)}
              >
                <Icon.Close size={Icon.ICON_SIZE.sm} />
              </Button>
            </li>
          ))}
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

  const set = implantSet ?? emptySet();

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
    const list = kind === 'implants' ? set.implants : set.boosters;
    onChange({ ...set, [kind]: [...list, entry.typeID] });
  }

  function removeFrom(kind: 'implants' | 'boosters', typeId: number) {
    const list = kind === 'implants' ? set.implants : set.boosters;
    onChange({ ...set, [kind]: list.filter((id) => id !== typeId) });
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
          onRemove={(typeId) => removeFrom('implants', typeId)}
          error={implantError}
        />
        <SlotList
          heading={t('fittings.implants.boostersHeading')}
          typeIds={set.boosters}
          max={MAX_BOOSTERS}
          names={names}
          onAdd={(name) => addTo('boosters', name)}
          onRemove={(typeId) => removeFrom('boosters', typeId)}
          error={boosterError}
        />
      </div>
    </Modal>
  );
}
