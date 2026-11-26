import { useTranslation } from 'react-i18next';
import { Caret, Checkbox, IskInput, SegmentedControl } from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { IMPROVE_REACHES, type DefenseChoice, type ImproveGoal } from '@/engine/fittings/improve';
import { TANK_GOALS } from '@/engine/fittings/improve';
import { formatIskCompact } from '@/lib/isk';
import { cx } from '@/lib/cx';
import {
  defenseOptions,
  pickedDefense,
  shownDefense,
  type ImproveSettings,
} from './improveSettings';
import { ImproveJobChoice } from './ImproveJobChoice';

interface Props {
  goal: ImproveGoal;
  settings: ImproveSettings;
  settingsOpen: boolean;
  settingsId: string;
  onToggleSettings: () => void;
  moreOpen: boolean;
  moreId: string;
  onToggleMore: () => void;
  skillsOpen: boolean;
  skillsId: string;
  skillsTriggerRef: (element: HTMLElement | null) => void;
  skillsPanelRef: (element: HTMLElement | null) => void;
}

export function ImproveSettingsPanel({
  goal,
  settings,
  settingsOpen,
  settingsId,
  onToggleSettings,
  moreOpen,
  moreId,
  onToggleMore,
  skillsOpen,
  skillsId,
  skillsTriggerRef,
  skillsPanelRef,
}: Props) {
  const { t } = useTranslation();
  const settingsSummary = [
    ...(settings.value.job
      ? [
          settings.value.job === 'explore'
            ? t('fittings.improve.job.summaryExplore', {
                space: t(`fittings.improve.job.spaceShort.${settings.value.space ?? 'dangerous'}`),
              })
            : t(`fittings.improve.job.${settings.value.job}`),
        ]
      : []),
    t(`fittings.improve.reach.${settings.value.reach}`),
    settings.value.iskBudget === null
      ? t('fittings.improve.summaryNoCap')
      : t('fittings.improve.summaryCap', {
          cap: formatIskCompact(settings.value.iskBudget),
        }),
    ...(settings.value.job && settings.value.includeRigs
      ? [t('fittings.improve.summaryRigsOn')]
      : []),
  ].join(' · ');

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className={textActionClassName('min-w-0 flex-wrap gap-x-1 text-left')}
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={onToggleSettings}
        >
          <span>{t('fittings.improve.settingsLabel')}</span>
          <Caret expanded={settingsOpen} />
          <span className="text-text-dim basis-full text-xs normal-case tracking-normal">
            {settingsSummary}
          </span>
        </button>
        <div ref={skillsTriggerRef} className="shrink-0" />
      </div>
      <Collapse open={settingsOpen} id={settingsId} className="pt-2">
        <div className="space-y-3">
          {settings.value.job && (
            <ImproveJobChoice
              job={settings.value.job}
              onJobChange={(job) => settings.onChange({ job })}
              space={settings.value.space}
              onSpaceChange={(space) => settings.onChange({ space })}
              noPropulsion={settings.value.noPropulsion}
              onNoPropulsionChange={(noPropulsion) => settings.onChange({ noPropulsion })}
            />
          )}
          <p className="text-text-dim text-xs">
            {t(
              goal === 'cheaper'
                ? 'fittings.improve.guardrail.cheaper'
                : TANK_GOALS.has(goal)
                  ? 'fittings.improve.guardrail.tank'
                  : 'fittings.improve.guardrail.combat'
            )}
          </p>
          <SegmentedControl
            label={t('fittings.improve.reachLabel')}
            options={IMPROVE_REACHES.map((value) => ({
              value,
              label: t(`fittings.improve.reach.${value}`),
            }))}
            value={settings.value.reach}
            onChange={(reach) => settings.onChange({ reach })}
            fill
          />
          <p className="text-text-dim text-xs">
            {t(`fittings.improve.reachHint.${settings.value.reach}`)}
          </p>
          <label className="block space-y-1 text-sm">
            <span>{t('fittings.improve.cap')}</span>
            <IskInput
              value={settings.value.iskBudget === null ? '' : String(settings.value.iskBudget)}
              onChange={(value) =>
                settings.onChange({ iskBudget: value === '' ? null : Number(value) })
              }
            />
          </label>
          {TANK_GOALS.has(goal) && (
            <>
              <SegmentedControl<DefenseChoice>
                label={t('fittings.improve.defenseLabel')}
                options={defenseOptions(settings.fittedSide ?? null).map((value) => ({
                  value,
                  label: t(`fittings.improve.defense.${value === 'keep' ? 'either' : value}`),
                  ...(value !== 'keep' &&
                  value !== settings.fittedSide &&
                  settings.value.reach === 'upgrade'
                    ? { disabled: true, disabledReason: t('fittings.improve.defenseUpgrade') }
                    : {}),
                }))}
                value={shownDefense(settings.value.defense, settings.fittedSide ?? null)}
                onChange={(picked) =>
                  settings.onChange({
                    defense:
                      picked === 'keep'
                        ? 'keep'
                        : pickedDefense(picked, settings.fittedSide ?? null),
                  })
                }
                fill
              />
              {settings.value.reach === 'upgrade' && (
                <p className="text-text-dim text-xs">{t('fittings.improve.defenseUpgrade')}</p>
              )}
            </>
          )}
          <div>
            <button
              type="button"
              className={textActionClassName('gap-1')}
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={onToggleMore}
            >
              {t('fittings.improve.moreLabel')}
              <Caret expanded={moreOpen} />
            </button>
            <Collapse open={moreOpen} id={moreId} className="pt-2">
              <div className="space-y-1">
                <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                  <Checkbox
                    checked={settings.value.includeRigs}
                    onChange={(event) => settings.onChange({ includeRigs: event.target.checked })}
                  />
                  {t('fittings.improve.includeRigs')}
                </label>
                <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                  <Checkbox
                    checked={settings.value.includeOfficer}
                    onChange={(event) =>
                      settings.onChange({ includeOfficer: event.target.checked })
                    }
                  />
                  {t('fittings.improve.includeOfficer')}
                </label>
                <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                  <Checkbox
                    checked={settings.value.allowMutated}
                    onChange={(event) => settings.onChange({ allowMutated: event.target.checked })}
                  />
                  {t('fittings.improve.allowMutated')}
                </label>
              </div>
            </Collapse>
          </div>
        </div>
      </Collapse>
      <Collapse open={skillsOpen} id={skillsId} className="pt-2">
        <div ref={skillsPanelRef} />
      </Collapse>
    </div>
  );
}
