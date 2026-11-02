/**
 * The search settings: one line summing them up that opens the controls
 * (reach, budget, defense, rigs and officer modules). Beside it sits the
 * Skills trigger, and under it the Skills panel, both filled by the free
 * sections through `ImproveSkillsSlotContext`.
 */
import { useTranslation } from 'react-i18next';
import { Caret, Checkbox, IskInput, SegmentedControl } from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { IMPROVE_REACHES, type DefenseChoice, type ImproveGoal } from '@/engine/fittings/improve';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
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
  /** The settings' own expansion, and the "More" group inside them. */
  settingsOpen: boolean;
  settingsId: string;
  onToggleSettings: () => void;
  moreOpen: boolean;
  moreId: string;
  onToggleMore: () => void;
  /** Skills share this area: its panel is filled by the free sections. */
  skillsOpen: boolean;
  skillsId: string;
  /** Where the Skills trigger and panel are mounted, for the portals that fill them. */
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
    ...(settings.job
      ? [
          settings.job === 'explore'
            ? t('fittings.improve.job.summaryExplore', {
                space: t(`fittings.improve.job.spaceShort.${settings.space ?? 'dangerous'}`),
              })
            : t(`fittings.improve.job.${settings.job}`),
        ]
      : []),
    t(`fittings.improve.reach.${settings.reach}`),
    settings.iskBudget === null
      ? t('fittings.improve.summaryNoCap')
      : t('fittings.improve.summaryCap', {
          cap: formatIskCompact(settings.iskBudget),
        }),
    ...(settings.job && settings.includeRigs ? [t('fittings.improve.summaryRigsOn')] : []),
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
          {settings.job && settings.onJobChange && (
            <ImproveJobChoice
              job={settings.job}
              onJobChange={settings.onJobChange}
              space={settings.space}
              onSpaceChange={(space) => settings.onSpaceChange?.(space)}
              noPropulsion={settings.noPropulsion}
              onNoPropulsionChange={settings.onNoPropulsionChange}
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
            value={settings.reach}
            onChange={settings.onReachChange}
            fill
          />
          <p className="text-text-dim text-xs">
            {t(`fittings.improve.reachHint.${settings.reach}`)}
          </p>
          <label className="block space-y-1 text-sm">
            <span>{t('fittings.improve.cap')}</span>
            <IskInput
              mask
              value={settings.iskBudget === null ? '' : String(settings.iskBudget)}
              onChange={(value) => settings.onIskBudgetChange(value === '' ? null : Number(value))}
            />
          </label>
          {TANK_GOALS.has(goal) && (
            <>
              <SegmentedControl<DefenseChoice>
                label={t('fittings.improve.defenseLabel')}
                // The fit's own side shows selected (Keep as is); the other side converts. A fit with no side also offers Either.
                options={defenseOptions(settings.fittedSide ?? null).map((value) => ({
                  value,
                  label: t(`fittings.improve.defense.${value === 'keep' ? 'either' : value}`),
                  // Upgrade swaps a module within its own type, so it can't change tank side.
                  ...(value !== 'keep' &&
                  value !== settings.fittedSide &&
                  settings.reach === 'upgrade'
                    ? { disabled: true, disabledReason: t('fittings.improve.defenseUpgrade') }
                    : {}),
                }))}
                value={shownDefense(settings.defense, settings.fittedSide ?? null)}
                onChange={(picked) =>
                  settings.onDefenseChange(
                    picked === 'keep' ? 'keep' : pickedDefense(picked, settings.fittedSide ?? null)
                  )
                }
                fill
              />
              {settings.reach === 'upgrade' && (
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
                    checked={settings.includeRigs}
                    onChange={(event) => settings.onIncludeRigsChange(event.target.checked)}
                  />
                  {t('fittings.improve.includeRigs')}
                </label>
                <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                  <Checkbox
                    checked={settings.includeOfficer}
                    onChange={(event) => settings.onIncludeOfficerChange(event.target.checked)}
                  />
                  {t('fittings.improve.includeOfficer')}
                </label>
                <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                  <Checkbox
                    checked={settings.allowMutated}
                    onChange={(event) => settings.onAllowMutatedChange(event.target.checked)}
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
