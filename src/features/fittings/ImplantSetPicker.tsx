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
                // Duplicate ids are legal (the picker enforces no uniqueness
                // beyond the slot count), so the id alone isn't a stable key.
                key={`${typeId}-${index}`}
                className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5"
              >
                <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                <span className="flex-1 truncate text-sm">{name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('fittings.implants.remove', { name })}
                  onClick={() => onRemove(index)}
                >
                  <Icon.Close size={Icon.ICON_SIZE.sm} />
                </Button>
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

  // Edited locally rather than read straight off the `implantSet` prop:
  // `onChange` round-trips through an async encode + `?f=` write before the
  // parent's prop reflects it, so two quick adds reading that prop would
  // both see the same stale list and the second would silently overwrite the
  // first. Re-seeded from the prop only when the modal transitions to open —
  // never while it stays open, so the workspace's own async round trip
  // doesn't stomp on an edit still in flight.
  const [localSet, setLocalSet] = useState<FittingImplantSet>(implantSet ?? EMPTY_SET);
  // React's own "adjust state during render" pattern (not an effect, not a
  // ref: https://react.dev/learn/you-might-not-need-an-effect) for "reset
  // when a prop changes" — here, when `open` flips false -> true.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setLocalSet(implantSet ?? EMPTY_SET);
  }

  useEffect(() => {
    if (!open) return;
    void loadItemNameMap().then(setNameMap);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadTypeNames([...localSet.implants, ...localSet.boosters]).then(setNames);
  }, [open, localSet.implants, localSet.boosters]);

  function commit(next: FittingImplantSet) {
    setLocalSet(next);
    onChange(next);
  }

  function addTo(kind: 'implants' | 'boosters', rawName: string) {
    const entry = nameMap.get(rawName.toLowerCase());
    const setError = kind === 'implants' ? setImplantError : setBoosterError;
    if (!entry) {
      setError(t('fittings.implants.notFound'));
      return;
    }
    setError(null);
    commit({ ...localSet, [kind]: [...localSet[kind], entry.typeID] });
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    commit({ ...localSet, [kind]: localSet[kind].filter((_, i) => i !== index) });
  }

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')}>
      <div className="space-y-4 p-3">
        <SlotList
          heading={t('fittings.implants.implantsHeading')}
          typeIds={localSet.implants}
          max={MAX_IMPLANTS}
          names={names}
          onAdd={(name) => addTo('implants', name)}
          onRemove={(index) => removeFrom('implants', index)}
          error={implantError}
        />
        <SlotList
          heading={t('fittings.implants.boostersHeading')}
          typeIds={localSet.boosters}
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
