/**
 * Thera / Turnur's filter row (issue #2499): From, Hub (with counts), Exit and
 * Fits as segmented controls in one row, a compact Route Preference picker on
 * the right. On a phone From keeps its own labelled line and the other four
 * become chips that open their options, each growing to fill its line, so
 * the filters read as full rows instead of a ragged wrap.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SegmentedControl,
} from '@/components/ui';
import { controlHeightClassName, toggleChipStateClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { THERA_EXITS, type TheraExit } from '@/engine/route/theraConnections';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { PreferenceField } from './PreferenceField';
import { HUB_OPTIONS, SIZE_OPTIONS, type HubOption, type SizeOption } from './theraOptions';

interface Option<V extends string> {
  value: V;
  label: string;
}

/** Named as the page's URL params, so a change goes straight to them. */
export interface TheraFilterValues {
  hub: HubOption;
  space: TheraExit;
  size: SizeOption;
  /** The preference in force: the URL's, else the pilot's Travel default. */
  pref: RoutePreferenceKind;
}

export function TheraFilters({
  origin,
  values,
  hubCounts,
  prefIsDefault,
  onChange,
}: {
  /** The From picker, built by the page (it owns the origin's fallback). */
  origin: ReactNode;
  values: TheraFilterValues;
  hubCounts: Readonly<Record<HubOption, number>>;
  /** No preference in the URL: the chip only takes the accent for one set there. */
  prefIsDefault: boolean;
  onChange: (next: Partial<TheraFilterValues>) => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();

  const hubOptions: Option<HubOption>[] = HUB_OPTIONS.map((hub) => ({
    value: hub,
    label: t('travel.thera.hubOption', {
      hub: t(`travel.thera.hub.${hub}`),
      count: hubCounts[hub],
    }),
  }));
  const exitOptions: Option<TheraExit>[] = THERA_EXITS.map((exit) => ({
    value: exit,
    label: t(`travel.thera.exit.${exit}`),
  }));
  const sizeOptions: Option<SizeOption>[] = SIZE_OPTIONS.map((size) => ({
    value: size,
    label: t(`travel.thera.fits.${size}`),
  }));

  if (isPhone) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="shrink-0 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase"
          >
            {t('travel.thera.originLabel')}
          </span>
          {origin}
        </div>
        <div className="flex flex-wrap gap-2">
          <ChipMenu
            label={t('travel.thera.hubLabel')}
            value={values.hub}
            options={hubOptions}
            isDefault={values.hub === 'all'}
            onChange={(hub) => onChange({ hub })}
          />
          <ChipMenu
            label={t('travel.thera.exitLabel')}
            value={values.space}
            options={exitOptions}
            isDefault={values.space === 'kspace'}
            onChange={(space) => onChange({ space })}
          />
          <ChipMenu
            label={t('travel.thera.fitsLabel')}
            value={values.size}
            options={sizeOptions}
            isDefault={values.size === 'any'}
            onChange={(size) => onChange({ size })}
          />
          <ChipMenu
            label={t('travel.preferenceLabel')}
            value={values.pref}
            options={ROUTE_PREFERENCES.map((preference) => ({
              value: preference,
              label: t(ROUTE_PREFERENCE_LABEL_KEYS[preference]),
            }))}
            isDefault={prefIsDefault}
            onChange={(pref) => onChange({ pref })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Labelled label={t('travel.thera.originLabel')}>{origin}</Labelled>
      <Labelled label={t('travel.thera.hubLabel')}>
        <SegmentedControl
          label={t('travel.thera.hubLabel')}
          value={values.hub}
          options={hubOptions}
          onChange={(hub) => onChange({ hub })}
        />
      </Labelled>
      <Labelled label={t('travel.thera.exitLabel')}>
        <SegmentedControl
          label={t('travel.thera.exitLabel')}
          value={values.space}
          options={exitOptions}
          onChange={(space) => onChange({ space })}
        />
      </Labelled>
      <Labelled label={t('travel.thera.fitsLabel')}>
        <SegmentedControl
          label={t('travel.thera.fitsLabel')}
          value={values.size}
          options={sizeOptions}
          onChange={(size) => onChange({ size })}
        />
      </Labelled>
      <Labelled label={t('travel.preferenceLabel')} className="ml-auto">
        <PreferenceField value={values.pref} onChange={(pref) => onChange({ pref })} />
      </Labelled>
    </div>
  );
}

/** A micro-label over a control: the row reads left to right, each group named once. */
function Labelled({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('flex flex-col items-start gap-1', className)}>
      <span
        aria-hidden="true"
        className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A phone filter chip: names the filter and its current choice, opens the
 * choices as a menu. Accent when set away from its default, and the choice is
 * in the words too, so a narrowed list does not read as narrowed by colour
 * alone.
 */
function ChipMenu<V extends string>({
  label,
  value,
  options,
  isDefault,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly Option<V>[];
  isDefault: boolean;
  onChange: (next: V) => void;
}) {
  const current = options.find((option) => option.value === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cx(
            'inline-flex grow items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            controlHeightClassName.sm,
            toggleChipStateClassName(!isDefault)
          )}
        >
          {/* A real space between the two: a flex gap is not one, and the
              accessible name would run together as "ExitK-space". */}
          <span className="text-text-dim">{label}</span> <span>{current}</span>
          <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" className="ml-auto shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as V)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
