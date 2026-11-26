import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  IconButton,
  Modal,
  SearchInput,
  TabPanel,
  Tabs,
  Tooltip,
  TypeIcon,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import { boosterSideEffects, withBoosters } from '@/engine/fittings/boosterSideEffects';
import * as Icon from '@/components/ui/icons';
import { ItemInfoLink } from '@/features/entities';
import {
  suggestionOptionClassName,
  suggestionPopupClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cloneSeedSet, type ImplantBasis } from '@/engine/fittings/implantBasis';
import { placeInSet, type ImplantEntry } from '@/engine/fittings/implantFinder';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import { useCombobox } from '@/lib/useCombobox';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypeNames } from '@/features/character/typeNames';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadImplantMarketEntries } from './implantSlotLookup';
import { loadImplantCatalog } from './useImplantFinder';
import { guarded } from '@/app/routeChunks';
import { enumParam } from '@/lib/urlState';
import { useUrlParam } from '@/lib/useUrlState';

const ImplantFinder = lazy(() =>
  guarded(() => import('./ImplantFinder')).then((m) => ({ default: m.ImplantFinder }))
);

const TAB_PARAM = enumParam(['find', 'set'] as const, 'find');

interface ImplantSetPickerProps {
  open: boolean;
  onClose: () => void;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
  finder?: {
    fitting: Fitting;
    profile: PilotProfile;
    basis: ImplantBasis;
  };
  onUseClone?: () => void;
}

const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

interface SlotListProps {
  heading: string;
  typeIds: readonly number[];
  names: Map<number, string>;
  onRemove: (index: number) => void;
  onInfo: (typeId: number) => void;
  renderDetail?: (typeId: number) => ReactNode;
}

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

const NO_ENTRIES: readonly ImplantEntry[] = [];

const loadSuggestionEntries = () =>
  loadImplantMarketEntries().then((loaded) => [...loaded.implants, ...loaded.boosters]);

const SUGGESTION_LIMIT = 8;

function AddItemForm({ onAdd, error }: { onAdd: (name: string) => void; error: string | null }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(true);
  const entries = useAsyncLoad(loadSuggestionEntries).data ?? NO_ENTRIES;
  const matches = useMemo(
    () => rankedSearch(entries, query, { primary: (entry) => entry.name, limit: SUGGESTION_LIMIT }),
    [entries, query]
  );
  const open = listOpen && matches.length > 0;
  const combo = useCombobox({ count: matches.length, open });

  function choose(name: string) {
    onAdd(name);
    setQuery('');
    combo.reset();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (combo.handleNavKey(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(matches[combo.highlight ?? 0]!.name);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setListOpen(false);
      combo.reset();
    }
  }

  return (
    <div className="relative space-y-1">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim() === '') return;
          onAdd(query.trim());
          setQuery('');
          combo.reset();
        }}
      >
        <SearchInput
          {...combo.inputProps}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            combo.reset();
            setListOpen(true);
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => setListOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={t('fittings.implants.addPlaceholder')}
          aria-label={t('fittings.implants.addLabel')}
        />
        <Tooltip content={query.trim() === '' ? t('fittings.implants.addNeedsQuery') : null}>
          <Button type="submit" aria-disabled={query.trim() === '' || undefined}>
            {t('fittings.implants.add')}
          </Button>
        </Tooltip>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      <ul
        {...combo.listboxProps}
        aria-label={t('fittings.implants.addLabel')}
        hidden={!open}
        className={suggestionPopupClassName}
      >
        {matches.map((entry, index) => (
          <li
            key={entry.typeId}
            {...combo.optionProps(index)}
            className={cx(suggestionOptionClassName(index === combo.activeIndex), 'gap-2')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(entry.name)}
          >
            <TypeIcon typeId={entry.typeId} size={32} width={20} height={20} />
            <span className="truncate">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlotList({ heading, typeIds, names, onRemove, onInfo, renderDetail }: SlotListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <p className={eyebrowClassName}>{heading}</p>
      {typeIds.length === 0 ? (
        <p className="text-sm text-text-dim">{t('fittings.implants.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {typeIds.map((typeId, index) => {
            const name = names.get(typeId) ?? t('fittings.implants.unknownType', { typeId });
            return (
              <li key={`${typeId}-${index}`} className="rounded-xs bg-panel-2 p-1.5">
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
  const [tab, setTab] = useUrlParam('implantTab', TAB_PARAM);
  const [nameMap, setNameMap] = useState<Map<string, { typeID: number }>>(new Map());
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [addError, setAddError] = useState<string | null>(null);
  const [infoTypeId, setInfoTypeId] = useState<number | null>(null);

  const fitting = finder?.fitting;
  const basis = finder?.basis;
  const cloneImplants = finder?.profile.implantTypeIds;
  const seed = useMemo(
    () => (basis ? cloneSeedSet(basis, implantSet, cloneImplants) : undefined),
    [basis, implantSet, cloneImplants]
  );
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
    void loadImplantCatalog().catch(() => undefined);
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
    const next = placeInSet(latestSet.current, catalog.slotOf, entry.typeID);
    latestSet.current = next;
    onChange(next);
  }

  function removeFrom(kind: 'implants' | 'boosters', index: number) {
    const remaining = set[kind].filter((_, i) => i !== index);
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
      <Modal
        open={open}
        onClose={onClose}
        title={t('fittings.implants.modalTitle')}
        closeOnBack={false}
      >
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
    <Modal
      open={open}
      onClose={onClose}
      title={t('fittings.implants.modalTitle')}
      placement="wide"
      closeOnBack={false}
    >
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
            <Suspense fallback={null}>
              <ImplantFinder
                open={open}
                fitting={plannedFitting}
                profile={finder.profile}
                basis={finder.basis}
                implantSet={set}
                onChange={onChange}
              />
            </Suspense>
          ) : (
            setEditor
          )}
        </TabPanel>
      </div>
    </Modal>
  );
}
