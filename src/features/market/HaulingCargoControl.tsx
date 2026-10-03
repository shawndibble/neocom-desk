/**
 * "Cargo space" on the Hauling Opportunities page: one control that opens a
 * small popover with three ways to say how much the hauler can carry — a ship
 * (its base hold), a saved Fitting (the exact hold, skills and expanders
 * included) or a typed number of m³ — plus an optional ISK budget.
 *
 * The popover body mounts only when opened, so the catalogue and saved
 * Fittings it reads cost nothing to a visit that never picks a ship.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  SegmentedControl,
  Spinner,
  TextInput,
} from '@/components/ui';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { buildHullCatalogue, searchHulls } from '@/engine/fittings/hullCatalogue';
import { useFittingCatalogue } from '@/features/fittings/useFittingCatalogue';
import { usePilotProfile } from '@/features/fittings/fittingPilotProfile';
import { savedRows, useSavedFittings } from '@/features/fittings/useLibraryFittings';
import { parseIskAmount } from '@/lib/isk';
import { fittingCargoM3, hullCargoM3, type HaulingCargo } from './haulingCargo';

type CargoTab = 'ship' | 'fitting' | 'custom';

/** The hull class a hauler most likely means; the rest is reachable by search. */
const DEFAULT_HULL_CLASS = 'Haulers and Industrial Ships';
const SHOWN_HULLS = 30;

interface HaulingCargoControlProps {
  characterId: number | null;
  cargo: HaulingCargo | null;
  onCargoChange: (cargo: HaulingCargo | null) => void;
  budget: number | null;
  onBudgetChange: (budget: number | null) => void;
}

function formatM3(m3: number): string {
  return `${Math.round(m3).toLocaleString()} m³`;
}

export function HaulingCargoControl({
  characterId,
  cargo,
  onCargoChange,
  budget,
  onBudgetChange,
}: HaulingCargoControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        // Gives way first when the summary bar is short of room (a phone, or a
        // tablet with the rail open): in a bar under 30rem the m³ goes, since
        // the bar's hold meter prints it beside the button, and past that the
        // name truncates on one line rather than wrapping inside a
        // fixed-height button.
        className={buttonClassName({
          variant: cargo === null ? 'primary' : 'ghost',
          size: 'sm',
          className: 'min-w-0',
        })}
        aria-label={t('market.hauling.cargo.label')}
      >
        <span className="truncate">
          {cargo === null ? (
            t('market.hauling.cargo.choose')
          ) : (
            <>
              {cargo.label}
              <span className="@max-[30rem]:hidden">
                {t('market.hauling.cargo.chosenM3', { m3: formatM3(cargo.m3) })}
              </span>
            </>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-3">
        {open && (
          <CargoPickerBody
            characterId={characterId}
            budget={budget}
            onBudgetChange={onBudgetChange}
            onPick={(next) => {
              onCargoChange(next);
              setOpen(false);
            }}
            onClear={() => {
              onCargoChange(null);
              onBudgetChange(null);
              setOpen(false);
            }}
            hasCargo={cargo !== null}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface CargoPickerBodyProps {
  characterId: number | null;
  budget: number | null;
  onBudgetChange: (budget: number | null) => void;
  onPick: (cargo: HaulingCargo) => void;
  onClear: () => void;
  hasCargo: boolean;
}

function CargoPickerBody({
  characterId,
  budget,
  onBudgetChange,
  onPick,
  onClear,
  hasCargo,
}: CargoPickerBodyProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CargoTab>('ship');
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const { profile } = usePilotProfile(characterId);

  async function choose(label: string, compute: () => Promise<number | null>) {
    setWorking(true);
    setFailed(false);
    try {
      const m3 = await compute();
      if (m3 === null || !(m3 > 0)) setFailed(true);
      else onPick({ label, m3 });
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<CargoTab>
        label={t('market.hauling.cargo.label')}
        size="sm"
        fill
        uppercase={false}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ship', label: t('market.hauling.cargo.tabShip') },
          { value: 'fitting', label: t('market.hauling.cargo.tabFitting') },
          { value: 'custom', label: t('market.hauling.cargo.tabCustom') },
        ]}
      />

      {tab === 'ship' && (
        <ShipTab
          disabled={working || profile === null}
          onChoose={(typeId, name) => void choose(name, () => hullCargoM3(typeId, profile!))}
        />
      )}
      {tab === 'fitting' && (
        <FittingTab
          characterId={characterId}
          disabled={working || profile === null}
          onChoose={(record) => void choose(record.name, () => fittingCargoM3(record, profile!))}
        />
      )}
      {tab === 'custom' && (
        <CustomTab onChoose={(m3) => onPick({ label: t('market.hauling.cargo.custom'), m3 })} />
      )}

      {working && <Spinner label={t('market.hauling.cargo.working')} size="sm" />}
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('market.hauling.cargo.failed')}
        </p>
      )}

      <BudgetField budget={budget} onChange={onBudgetChange} />

      {hasCargo && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('market.hauling.cargo.clear')}
        </Button>
      )}
    </div>
  );
}

function ShipTab({
  onChoose,
  disabled,
}: {
  onChoose: (typeId: number, name: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const catalogue = useFittingCatalogue();
  const [query, setQuery] = useState('');
  const hulls = useMemo(
    () =>
      catalogue === null
        ? []
        : buildHullCatalogue([...catalogue.groupsById.values()], catalogue.marketTypes),
    [catalogue]
  );
  const shown = useMemo(() => {
    const classes =
      query.trim() === ''
        ? hulls.filter((c) => c.name === DEFAULT_HULL_CLASS)
        : searchHulls(hulls, query);
    return classes.flatMap((c) => c.hulls).slice(0, SHOWN_HULLS);
  }, [hulls, query]);

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        aria-label={t('market.hauling.cargo.searchShips')}
        placeholder={t('market.hauling.cargo.searchShipsPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {catalogue === null ? (
        <p className="text-xs text-text-dim">{t('common.loading')}</p>
      ) : (
        <ul className="flex max-h-56 flex-col overflow-y-auto">
          {shown.map((hull) => (
            <li key={hull.typeId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChoose(hull.typeId, hull.name)}
                className="flex w-full items-baseline justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-sm hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{hull.name}</span>
                <span className="text-[0.6875rem] text-text-dim">{hull.group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[0.6875rem] text-text-dim">{t('market.hauling.cargo.shipHint')}</p>
    </div>
  );
}

function FittingTab({
  characterId,
  onChoose,
  disabled,
}: {
  characterId: number | null;
  onChoose: (record: NonNullable<ReturnType<typeof savedRows>[number]['record']>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { records, hulls } = useSavedFittings(characterId);
  const rows = savedRows(records, hulls);
  if (characterId === null || rows.length === 0) {
    return <p className="text-xs text-text-dim">{t('market.hauling.cargo.noFittings')}</p>;
  }
  return (
    <ul className="flex max-h-56 flex-col overflow-y-auto">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChoose(row.record)}
            className="flex w-full items-baseline justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-sm hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{row.name}</span>
            <span className="text-[0.6875rem] text-text-dim">{row.hull}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CustomTab({ onChoose }: { onChoose: (m3: number) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const parsed = parseIskAmount(text);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed !== null && parsed > 0) onChoose(parsed);
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-[0.6875rem] uppercase tracking-wider text-text-dim">
        {t('market.hauling.cargo.customLabel')}
        <TextInput
          size="sm"
          inputMode="numeric"
          placeholder="12,400"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <Button type="submit" size="sm" disabled={parsed === null || parsed <= 0}>
        {t('market.hauling.cargo.use')}
      </Button>
    </form>
  );
}

function BudgetField({
  budget,
  onChange,
}: {
  budget: number | null;
  onChange: (budget: number | null) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(budget === null ? '' : budget.toLocaleString());
  return (
    <label className="flex flex-col gap-1 border-t border-line pt-3 text-[0.6875rem] uppercase tracking-wider text-text-dim">
      {t('market.hauling.cargo.budgetLabel')}
      <TextInput
        size="sm"
        inputMode="numeric"
        placeholder={t('market.hauling.cargo.budgetPlaceholder')}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseIskAmount(event.target.value);
          onChange(parsed !== null && parsed > 0 ? parsed : null);
        }}
      />
      <span className="text-[0.6875rem] normal-case tracking-normal">
        {t('market.hauling.cargo.budgetHint')}
      </span>
    </label>
  );
}
