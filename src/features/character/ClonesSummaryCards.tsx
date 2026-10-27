import { useTranslation } from 'react-i18next';
import {
  IskAmount,
  Panel,
  ProgressBar,
  STAT_CHIP_TONE_TEXT_CLASS,
  type StatChipTone,
} from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { SecurityStatus } from '@/components/SecurityStatus';
import { cooldownProgress, type ImplantValue } from '@/engine/implantValue';
import { cloneJumpCooldownHours, type CloneJumpCooldown } from '@/engine/clone/cloneJump';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import { JumpsAwayText } from '@/features/assets/assetBrowserRows';
import { TOUCH_LINK } from '@/features/character/CloneCard';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';

interface ClonesSummaryCardsProps {
  cooldown: CloneJumpCooldown;
  lastCloneJumpDate: string | null;
  infomorphLevel: number;
  loadedAt: number;
  timeZone: string | undefined;
  characterSystemId: number | null;
  characterSystemName: string | null;
  securities: ReadonlyMap<number, number>;
  /** Whether the worn-implants read came back at all. */
  hasWorn: boolean;
  wornIds: readonly number[];
  wornValue: ImplantValue | null;
  homeLocationId: number | undefined;
  homeLocationName: string | null;
  homeSecurity: number | undefined;
  homeJumps: JumpsAwayResult | undefined;
  lastStationChangeDate: string | null;
}

/** The cooldown, current location and respawn cards above the clone list. */
export function ClonesSummaryCards({
  cooldown,
  lastCloneJumpDate,
  infomorphLevel,
  loadedAt,
  timeZone,
  characterSystemId,
  characterSystemName,
  securities,
  hasWorn,
  wornIds,
  wornValue,
  homeLocationId,
  homeLocationName,
  homeSecurity,
  homeJumps,
  lastStationChangeDate,
}: ClonesSummaryCardsProps) {
  const { t } = useTranslation();
  const cooldownHours = cloneJumpCooldownHours(infomorphLevel);
  const cooldownFraction = cooldownProgress(lastCloneJumpDate, cooldownHours, new Date(loadedAt));

  // Empty (no element at all) when there is no last jump and no reduction to state.
  const cooldownNote = [
    lastCloneJumpDate &&
      t('clones.lastJump', {
        date: formatTimestamp(new Date(lastCloneJumpDate), timeZone),
      }),
    infomorphLevel > 0 && t('clones.infomorphReduction', { hours: Math.min(infomorphLevel, 24) }),
  ]
    .filter(Boolean)
    .join(' · ');
  const cooldownTone: StatChipTone = cooldown.onCooldown ? 'warning' : 'success';

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4 text-sm">
      <Panel className="h-full">
        <section aria-label={t('clones.cooldown')} className="space-y-1">
          <h3 className={eyebrowClassName}>{t('clones.cooldownShared')}</h3>
          {/* The header above names it; the value wraps rather than sitting in a nowrap chip. */}
          <p className={`font-medium tabular-nums ${STAT_CHIP_TONE_TEXT_CLASS[cooldownTone]}`}>
            {cooldown.onCooldown && cooldown.readyAt
              ? t('clones.cooldownOnCooldownValue', {
                  date: formatTimestamp(cooldown.readyAt, timeZone),
                  duration: formatDuration((cooldown.readyAt.getTime() - loadedAt) / 1000),
                })
              : t('clones.cooldownReadyValue')}
          </p>
          <ProgressBar
            label={t('clones.cooldown')}
            value={Math.round(cooldownFraction * 100)}
            tone={cooldown.onCooldown ? 'warning' : 'success'}
          />
          {cooldownNote && <p className="text-xs text-text-dim">{cooldownNote}</p>}
        </section>
      </Panel>
      <Panel className="h-full">
        <section aria-label={t('clones.youAreIn')} className="space-y-1">
          <h3 className={eyebrowClassName}>{t('clones.youAreIn')}</h3>
          <p>
            {characterSystemName ?? t('clones.unknownPlace')}{' '}
            {characterSystemId !== null && securities.has(characterSystemId) && (
              <SecurityStatus security={securities.get(characterSystemId) ?? 0} />
            )}
          </p>
          {hasWorn && (
            <p className="text-xs text-text-dim">
              {t('clones.implantCount', { count: wornIds.length })}
              {wornValue && wornValue.unpriced < wornIds.length && (
                <>
                  {' · '}
                  <IskAmount value={wornValue.total} /> {t('clones.atRisk')}
                  {wornValue.unpriced > 0 &&
                    ` · ${t('clones.unpriced', { count: wornValue.unpriced })}`}
                </>
              )}
            </p>
          )}
        </section>
      </Panel>
      {homeLocationName && (
        <Panel className="h-full">
          <section aria-label={t('clones.respawn')} className="space-y-1">
            <h3 className={eyebrowClassName}>{t('clones.respawn')}</h3>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="[overflow-wrap:anywhere]">{homeLocationName}</span>
              {homeSecurity !== undefined && <SecurityStatus security={homeSecurity} />}
              <JumpsAwayText
                result={homeJumps}
                t={t}
                locationId={homeLocationId}
                linkClassName={TOUCH_LINK}
              />
            </p>
            {lastStationChangeDate && (
              <p className="text-xs text-text-dim">
                {t('clones.lastStationChange', {
                  date: formatTimestamp(new Date(lastStationChangeDate), timeZone),
                })}
              </p>
            )}
          </section>
        </Panel>
      )}
    </div>
  );
}
