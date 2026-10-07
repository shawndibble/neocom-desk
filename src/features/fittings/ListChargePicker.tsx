import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  TypeIcon,
} from '@/components/ui';
import {
  fieldBaseClassName,
  fieldSizeClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { setModuleCharge } from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingModule, FittingModuleResult } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { CapBoosterGuide } from './CapBoosterGuide';
import { chargeRowClassName } from './chargeRowStyle';
import { MiningCrystalGuide } from './MiningCrystalGuide';
import { ChargePickerGroup } from './ChargePicker';
import { DEFAULT_PICKER_SETTINGS } from './chargePickerSettings';
import type { FittingContext } from './fittingContext';
import { useChargeChoices } from './useChargeChoices';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

type Scope = 'all' | 'one';

interface ListChargePickerProps {
  module: FittingModule;
  /** This module's own calculated result: its charge groups. */
  result: FittingModuleResult | undefined;
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  /** Null while the engine or pilot loads: the picker lists charges by name, without figures. */
  context: FittingContext | null;
  edit: (change: FittingChange) => void;
  className?: string;
}

/**
 * A List row's charge control (issue: the flat `<select>`): a button naming
 * the loaded charge that opens the Charge Picker — a popover under it on a
 * pointer screen, a bottom sheet on a phone — with "All N / This gun" for
 * whether the pick loads into every gun of the type or just this one, and
 * "No charge". The engine works the figures out only once it's open.
 */
export function ListChargePicker({
  module,
  result,
  fitting,
  catalogue,
  context,
  edit,
  className,
}: ListChargePickerProps) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const [open, setOpen] = useState(false);
  const moduleName = catalogueTypeName(catalogue, module.typeId);
  const loaded = module.chargeTypeId;

  const trigger = (
    <button
      type="button"
      aria-label={t('fittings.chargePicker.triggerLabel', {
        name: moduleName,
        charge:
          loaded === undefined ? t('fittings.edit.noCharge') : catalogueTypeName(catalogue, loaded),
      })}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={narrow ? () => setOpen(true) : undefined}
      className={cx(
        fieldBaseClassName,
        fieldSizeClassName.sm,
        'relative flex min-w-0 items-center gap-1.5 pr-6 text-left',
        tappableRowClassName,
        className
      )}
    >
      {loaded !== undefined && <TypeIcon typeId={loaded} size={32} width={16} height={16} />}
      <span className={cx('min-w-0 flex-1 truncate', loaded === undefined && 'text-text-dim')}>
        {loaded === undefined ? t('fittings.edit.noCharge') : catalogueTypeName(catalogue, loaded)}
      </span>
      <Icon.Expanded
        size={Icon.ICON_SIZE.sm}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-text-dim"
      />
    </button>
  );

  const panel = open && (
    <ChargePickerPanel
      module={module}
      result={result}
      fitting={fitting}
      catalogue={catalogue}
      context={context}
      edit={edit}
      onDone={() => setOpen(false)}
    />
  );

  if (narrow) {
    return (
      <>
        {trigger}
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={t('fittings.chargePicker.sheetTitle', { name: moduleName })}
          placement="sheet"
        >
          {panel}
        </Modal>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t('fittings.chargePicker.sheetTitle', { name: moduleName })}
        className="max-h-[min(36rem,80vh)] w-80 overflow-y-auto p-2"
        onEscapeKeyDown={(event) => {
          // An Escape inside a dialog opened from the picker (the crystal
          // guide's help) is that dialog's. The popover hears it first, on the
          // document, and cancels it whether it closes or not, and a browser
          // won't close a dialog on a cancelled Escape. So the popover stays
          // open and hands the dialog its close request itself.
          const dialog =
            event.target instanceof Element
              ? event.target.closest<HTMLDialogElement>('dialog[open]')
              : null;
          if (!dialog) return;
          event.preventDefault();
          if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
        }}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

function ChargePickerPanel({
  module,
  result,
  fitting,
  catalogue,
  context,
  edit,
  onDone,
}: Omit<ListChargePickerProps, 'className'> & { onDone: () => void }) {
  const { t } = useTranslation();
  const at = useMemo(
    () =>
      fitting.modules
        .filter((m) => m.typeId === module.typeId)
        .map(({ slot, slotIndex }) => ({ slot, slotIndex })),
    [fitting.modules, module.typeId]
  );
  const [scope, setScope] = useState<Scope>('all');
  // Every module of this type shares this one's charge groups: all the hook needs.
  const moduleResults = useMemo(
    () =>
      fitting.modules.map((m): FittingModuleResult =>
        m.typeId === module.typeId && result
          ? result
          : { state: m.state, maxState: m.state, chargeGroupIds: [] }
      ),
    [fitting.modules, module.typeId, result]
  );
  const { groups, pricesLoading } = useChargeChoices({
    fitting,
    context,
    moduleResults,
    moduleTypeId: module.typeId,
  });
  const group = groups?.[0];
  const loaded = module.chargeTypeId;
  // A charge the engine doesn't list for this module (pasted in, say) stays named, as the old select kept it.
  const offList =
    loaded !== undefined && group !== undefined && !group.choices.some((c) => c.typeId === loaded);
  // Before the engine (or a pilot) is ready there are no figures: every charge its groups name, by name.
  const plainIds = useMemo(() => {
    if (group) return group.choices.map((c) => c.typeId);
    if (catalogue === null) return [];
    return (result?.chargeGroupIds ?? [])
      .flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? [])
      .sort((a, b) =>
        catalogueTypeName(catalogue, a).localeCompare(catalogueTypeName(catalogue, b))
      );
  }, [group, catalogue, result]);

  const targets = scope === 'all' ? at : [{ slot: module.slot, slotIndex: module.slotIndex }];
  const load = (chargeTypeId: number | null) => {
    edit((f) =>
      targets.reduce((next, p) => setModuleCharge(next, p.slot, p.slotIndex, chargeTypeId), f)
    );
    onDone();
  };

  return (
    <div className="space-y-2">
      {at.length > 1 && (
        <SegmentedControl
          label={t('fittings.chargePicker.scopeLabel')}
          size="sm"
          fill
          uppercase={false}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: t('fittings.chargePicker.scopeAll', { count: at.length }) },
            { value: 'one', label: t('fittings.chargePicker.scopeOne') },
          ]}
        />
      )}
      {offList && (
        <p className="text-[0.6875rem] text-warning">
          {t('fittings.chargePicker.loadedOffList', { name: catalogueTypeName(catalogue, loaded) })}
        </p>
      )}
      {group?.isMiner ? (
        <MiningCrystalGuide
          group={group}
          onLoad={(chargeTypeId) => load(chargeTypeId)}
          pricesLoading={pricesLoading}
        />
      ) : group?.isCapBooster ? (
        <CapBoosterGuide
          group={group}
          onLoad={(chargeTypeId) => load(chargeTypeId)}
          pricesLoading={pricesLoading}
        />
      ) : group?.isWeapon ? (
        <ChargePickerGroup
          group={group}
          settings={DEFAULT_PICKER_SETTINGS}
          onLoad={(chargeTypeId) => load(chargeTypeId)}
          pricesLoading={pricesLoading}
        />
      ) : (
        <ul>
          {plainIds.map((typeId) => {
            const isLoaded = typeId === loaded;
            return (
              <li key={typeId}>
                <button
                  type="button"
                  aria-pressed={isLoaded}
                  onClick={() => load(typeId)}
                  className={chargeRowClassName(
                    isLoaded,
                    'flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs md:min-h-9'
                  )}
                >
                  <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                  <span className="min-w-0 flex-1 truncate">
                    {catalogueTypeName(catalogue, typeId)}
                  </span>
                  {isLoaded && (
                    <span className="shrink-0 text-[0.6875rem]">{t('fittings.add.loaded')}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {module.chargeTypeId !== undefined && (
        <div className="flex justify-end border-t border-line pt-2">
          <Button size="sm" onClick={() => load(null)}>
            {t('fittings.edit.noCharge')}
          </Button>
        </div>
      )}
    </div>
  );
}
