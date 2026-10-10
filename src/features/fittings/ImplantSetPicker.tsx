/**
 * Edits the implant/booster set a Fitting carries.
 *
 * Adds by exact (case-insensitive) item name via the same `loadItemNameMap`
 * the EFT loader resolves names through, from one box: the implant catalog
 * (`loadImplantCatalog`) says which slot the item takes, and it goes there
 * (`placeInSet`), replacing whatever held that slot, as Find by goal does.
 *
 * Given the open Fitting and pilot (`finder`), it opens on "Find by goal"
 * (`ImplantFinder`) instead, with this list under "Your set".
 *
 * It's a planner: on "My clone" with no set of the Fitting's own, it starts
 * from the clone's implants, and the first change saves that plan to the
 * Fitting — which is what puts the page on it — while opening it alone
 * changes nothing. "Use my clone" drops the set again.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  IconButton,
  Modal,
  SearchInput,
  TabPanel,
  Tabs,
  TypeIcon,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import { boosterSideEffects, withBoosters } from '@/engine/fittings/boosterSideEffects';
import * as Icon from '@/components/ui/icons';
import { ItemInfoLink } from '@/features/entities';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import { placeInSet } from '@/engine/fittings/implantFinder';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypeNames } from '@/features/character/typeNames';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { ImplantFinder } from './ImplantFinder';
import { loadImplantCatalog } from './useImplantFinder';

interface ImplantSetPickerProps {
  open: boolean;
  onClose: () => void;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
  /** The open Fitting and pilot: turns on "Find by goal". */
  finder?: {
    fitting: Fitting;
    profile: PilotProfile;
    basis: ImplantBasis;
  };
  /** Drops the Fitting's own set, so the stats go back to the clone; absent: no clone to go back to. */
  onUseClone?: () => void;
}

/** Stable identity: a fresh `{implants: [], boosters: []}` every render would
 * re-fire the name-resolve effect below every render whenever no set is
 * carried yet — the common case for a freshly-loaded Fitting. */
const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

interface SlotListProps {
  heading: string;
  typeIds: readonly number[];
  names: Map<number, string>;
  /** By position, not type id — a set may legally carry the same id twice. */
  onRemove: (index: number) => void;
  /** Opens an entry's details (Show Info), from the row's ⓘ; the name goes to Market. */
  onInfo: (typeId: number) => void;
  /** Under an entry: its own controls (a booster's side effects). */
  renderDetail?: (typeId: number) => ReactNode;
}

/**
 * A booster's side effects, each a switch: off by default (a booster is
 * assumed to roll none), on to see the fit with it.
 */
function SideEffectSwitches({
  boosterTypeId,
  switchedOn,
  onToggle,
}: {
  boosterTypeId: number;
  switchedOn: readonly number[];
  onToggle: (effectId: number, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const effects = boosterSideEffects(boosterTypeId);
  if (effects.length === 0) return null;
  return (
    <fieldset className="mt-1 space-y-0.5 pl-8">
      <legend className="text-xs text-text-dim">{t('fittings.implants.sideEffects')}</legend>
      {effects.map((effect) => (
        <label
          key={effect.effectId}
          className={`flex cursor-pointer items-center gap-2 text-xs ${tappableRowClassName}`}
        >
          <Checkbox
            checked={switchedOn.includes(effect.effectId)}
            onChange={(event) => onToggle(effect.effectId, event.target.checked)}
          />
          {t('fittings.implants.sideEffect', {
            what: t(`fittings.implants.sideEffectName.${effect.effectId}`),
            pct: `${effect.penaltyPct > 0 ? '+' : '−'}${Math.abs(effect.penaltyPct)}`,
          })}
        </label>
      ))}
    </fieldset>
  );
}

/** One box for both lists: the item itself decides where it goes. */
function AddItemForm({ onAdd, error }: { onAdd: (name: string) => void; error: string | null }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  return (
    <div className="space-y-1">
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
          aria-label={t('fittings.implants.addLabel')}
        />
        <Button type="submit" size="sm" disabled={query.trim() === ''}>
          {t('fittings.implants.add')}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function SlotList({ heading, typeIds, names, onRemove, onInfo, renderDetail }: SlotListProps) {
  const { t } = useTranslation();

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
                className="rounded-xs bg-panel-2 p-1.5"
              >
                <div className="flex items-center gap-2">
                  <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                  <ItemInfoLink
                    typeId={typeId}
                    className={`${tappableRowClassName} flex min-w-0 flex-1 items-center text-sm`}
                  >
                    <span className="truncate">{name}</span>
                  </ItemInfoLink>
                  <IconButton
                    variant="plain"
                    size="sm"
                    icon={<Icon.Info />}
                    label={t('fittings.implantFinder.info', { name })}
                    onClick={() => onInfo(typeId)}
                  />
                  <IconButton
                    variant="plain"
                    size="sm"
                    tone="danger"
                    icon={<Icon.Close />}
                    label={t('fittings.implants.remove', { name })}
                    onClick={() => onRemove(index)}
                  />
                </div>
                {renderDetail?.(typeId)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ImplantSetPicker({
  open,
  onClose,
  implantSet,
  onChange,
  finder,
  onUseClone,
}: ImplantSetPickerProps) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [tab, setTab] = useState<'find' | 'set'>('find');
  const [nameMap, setNameMap] = useState<Map<string, { typeID: number }>>(new Map());
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [addError, setAddError] = useState<string | null>(null);
  const [infoTypeId, setInfoTypeId] = useState<number | null>(null);

  const fitting = finder?.fitting;
  const onClone = finder?.basis === 'clone';
  const cloneImplants = finder?.profile.implantTypeIds;
  /** The clone's implants, as the plan to start from — see this file's own doc. */
  const seed = useMemo<FittingImplantSet | undefined>(
    () =>
      onClone && implantSet === undefined && cloneImplants && cloneImplants.length > 0
        ? { implants: [...cloneImplants], boosters: [] }
        : undefined,
    [onClone, implantSet, cloneImplants]
  );
  // Stable per Fitting and seed: the finder re-screens every family whenever this changes.
  const plannedFitting = useMemo(
    () => (fitting && seed ? { ...fitting, implantSet: seed } : fitting),
    [fitting, seed]
  );
  const set = implantSet ?? seed ?? EMPTY_SET;
  const latestSet = useRef(set);
  useEffect(() => {
    latestSet.current = set;
  }, [set]);

  useEffect(() => {
    if (!open) return;
    void loadItemNameMap().then(setNameMap);
    void loadImplantCatalog().catch(() => undefined); // warm, so an add sorts at once
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadTypeNames([...set.implants, ...set.boosters]).then(setNames);
  }, [open, set.implants, set.boosters]);

  async function add(rawName: string) {
    const entry = nameMap.get(rawName.toLowerCase());
    if (!entry) {
      setAddError(t('fittings.implants.notFound'));
      return;
    }
    const catalog = await loadImplantCatalog().catch(() => null);
    if (!catalog) {
      setAddError(t('fittings.implants.catalogFailed'));
      return;
    }
    if (!catalog.slotOf(entry.typeID)) {
      setAddError(t('fittings.implants.notImplantOrBooster', { name: rawName }));
      return;
    }
    setAddError(null);
    // The set as of now, not as of the submit: another add may have landed meanwhile.
    const next = placeInSet(latestSet.current, catalog.slotOf, entry.typeID);
    latestSet.current = next;
    onChange(next);
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    const remaining = set[kind].filter((_, i) => i !== index);
    // A side effect whose booster is gone goes with it.
    onChange(kind === 'boosters' ? withBoosters(set, remaining) : { ...set, implants: remaining });
  }

  function toggleSideEffect(effectId: number, on: boolean) {
    const current = set.boosterSideEffects ?? [];
    const sideEffects = on
      ? [...current.filter((id) => id !== effectId), effectId]
      : current.filter((id) => id !== effectId);
    onChange({
      implants: set.implants,
      boosters: set.boosters,
      ...(sideEffects.length > 0 ? { boosterSideEffects: sideEffects } : {}),
    });
  }

  const setEditor = (
    <div className="space-y-4">
      <AddItemForm onAdd={(name) => void add(name)} error={addError} />
      <SlotList
        heading={t('fittings.implants.implantsHeading')}
        typeIds={set.implants}
        names={names}
        onRemove={(index) => removeFrom('implants', index)}
        onInfo={setInfoTypeId}
      />
      <SlotList
        heading={t('fittings.implants.boostersHeading')}
        typeIds={set.boosters}
        names={names}
        onRemove={(index) => removeFrom('boosters', index)}
        onInfo={setInfoTypeId}
        renderDetail={(typeId) => (
          <SideEffectSwitches
            boosterTypeId={typeId}
            switchedOn={set.boosterSideEffects ?? []}
            onToggle={toggleSideEffect}
          />
        )}
      />
      {infoTypeId !== null && (
        <ItemDetailModal
          typeId={infoTypeId}
          itemName={
            names.get(infoTypeId) ?? t('fittings.implants.unknownType', { typeId: infoTypeId })
          }
          onClose={() => setInfoTypeId(null)}
          showOpenInMarket
        />
      )}
    </div>
  );

  // What the stats are on now, and the way back to the clone from a set.
  const inUse = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-dim">
      <p>
        {implantSet === undefined && onUseClone
          ? t('fittings.implants.cloneExplain')
          : t('fittings.implants.fittingExplain')}
      </p>
      {implantSet !== undefined && onUseClone && (
        <Button size="sm" onClick={onUseClone}>
          {t('fittings.implants.useClone')}
        </Button>
      )}
    </div>
  );

  if (!finder || !plannedFitting) {
    return (
      <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')}>
        <div className="space-y-3 p-3">
          {inUse}
          {setEditor}
        </div>
      </Modal>
    );
  }
  const tabs: TabItem[] = [
    { id: 'find', label: t('fittings.implantFinder.tabFind') },
    { id: 'set', label: t('fittings.implantFinder.tabSet') },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t('fittings.implants.modalTitle')} placement="wide">
      <div className="space-y-3 p-3">
        {inUse}
        <Tabs
          tabsId={tabsId}
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as 'find' | 'set')}
          label={t('fittings.implants.modalTitle')}
        />
        <TabPanel tabsId={tabsId} tabId={tab}>
          {tab === 'find' ? (
            <ImplantFinder
              open={open}
              fitting={plannedFitting}
              profile={finder.profile}
              basis={finder.basis}
              implantSet={set}
              onChange={onChange}
            />
          ) : (
            setEditor
          )}
        </TabPanel>
      </div>
    </Modal>
  );
}
