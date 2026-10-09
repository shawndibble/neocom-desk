/**
 * One pilot of a Local list as a phone card (below `sm`): portrait, name and
 * corporation, the 30-day kill count as the one big number, the Threat badge
 * and standing, then kills by space as a stat strip. Washed by Threat level so
 * a Dangerous pilot stands out while scrolling (decision `20261008-225809`).
 * At `sm` and up the same rows are a table.
 */
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import type { KillSpace, KillSummary } from '@/engine/pilotList/killActivity';
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';
import { CharacterLink } from '@/features/entities';
import { cx } from '@/lib/cx';
import type { PilotListRow } from './pilotListData';
import { PilotAffiliation } from './PilotAffiliation';
import { PilotStandingTag } from './PilotStandingTag';
import { SPACE_TEXT } from './pilotListStyles';
import { ThreatBadge } from './ThreatBadge';
import { DANGEROUS_MIN_KILLS } from '@/engine/pilotList/threatVerdict';
import {
  THREAT_BAR_CLASS,
  THREAT_LEVEL_TONE,
  THREAT_ROW_CLASS,
  THREAT_TEXT_CLASS,
} from './threatTone';

/** Where most of the recent kills were; the worse space wins a tie. Null with no recent kill that says where. */
function mainSpaceOf(bySpace: KillSummary['bySpace']): KillSpace | null {
  let best: KillSpace | null = null;
  for (const space of ['nullsec', 'wormhole', 'lowsec', 'highsec'] as const) {
    if (bySpace[space].count > (best === null ? 0 : bySpace[best].count)) best = space;
  }
  return best;
}

export function PilotCard({
  row,
  threat,
  spaces,
  flew,
}: {
  row: PilotListRow;
  threat: ThreatLevel | 'pending' | null;
  spaces: readonly KillSpace[];
  /** Hull names already joined for display; null when there are none to show. */
  flew: string | null;
}) {
  const { t } = useTranslation();
  const tone = threat === null ? null : THREAT_LEVEL_TONE[threat];
  const ready = row.kills.kind === 'ready' ? row.kills.summary : null;
  const big =
    ready !== null ? ready.recentCount.toLocaleString() : row.kills.kind === 'loading' ? '…' : '—';
  const status =
    row.kills.kind === 'loading'
      ? t('travel.pilot.list.stateLoading')
      : row.kills.kind === 'unreachable'
        ? t('travel.pilot.list.stateUnreachable')
        : null;
  const own = row.ownOrganization;
  const mainSpace = ready === null ? null : mainSpaceOf(ready.bySpace);

  return (
    <li
      className={cx(
        'space-y-1.5 border border-l-2 border-line border-l-transparent p-2.5',
        tone !== 'warning' && 'bg-panel',
        tone !== null && THREAT_ROW_CLASS[tone],
        threat === 'dangerous' && 'border-danger shadow-[0_0_18px_-4px] shadow-danger/50'
      )}
    >
      <div className="flex items-center gap-2.5">
        {row.characterId !== null && (
          <span className="size-10 shrink-0 [&>img]:size-full">
            <CharacterAvatar characterId={row.characterId} size="lg" loading="lazy" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {row.characterId === null ? (
              row.name
            ) : (
              <CharacterLink id={row.characterId}>{row.name}</CharacterLink>
            )}
          </div>
          <PilotAffiliation row={row} className="text-xs text-text-dim" />
        </div>
        <div className="shrink-0 text-right">
          <b
            className={cx(
              'block text-[1.625rem] leading-none font-semibold tabular-nums',
              tone !== null && THREAT_TEXT_CLASS[tone],
              threat === 'dangerous' && 'text-[2.125rem]'
            )}
          >
            <span className="sr-only">{t('travel.pilot.list.killsLabel')}: </span>
            {big}
          </b>
          <span aria-hidden className="text-[0.625rem] tracking-widest text-text-dim uppercase">
            {t('travel.pilot.list.killsLabel')}
          </span>
        </div>
      </div>

      {(threat !== null || row.standing !== null || own !== null || status !== null) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-dim">
          {threat !== null && <ThreatBadge level={threat} solid />}
          {mainSpace !== null && (
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-xs border border-line-bright px-1.5 py-px text-[0.6875rem] leading-4 font-semibold tracking-widest uppercase',
                SPACE_TEXT[mainSpace]
              )}
            >
              <Icon.Combat size={12} />
              {t('travel.pilot.list.mainSpace', {
                space: t(`common.spaceOption.${mainSpace}`).toLowerCase(),
              })}
            </span>
          )}
          {own !== null && <span>{t(`travel.pilot.list.own.${own}`)}</span>}
          {row.standing !== null && <PilotStandingTag standing={row.standing} />}
          {status !== null && <span>{status}</span>}
        </div>
      )}

      {ready !== null && tone !== null && (
        <div aria-hidden className="h-1 bg-line">
          <div
            className={cx('h-full', THREAT_BAR_CLASS[tone])}
            style={{ width: `${Math.min(ready.recentCount / DANGEROUS_MIN_KILLS, 1) * 100}%` }}
          />
        </div>
      )}

      {ready !== null && (
        <dl
          className="grid gap-px border border-line bg-line"
          style={{ gridTemplateColumns: `repeat(${spaces.length}, minmax(0, 1fr))` }}
        >
          {spaces.map((space) => {
            const { count } = ready.bySpace[space];
            return (
              <div key={space} className="bg-panel-2 px-2 py-1">
                <dt className="text-[0.625rem] tracking-widest text-text-dim uppercase">
                  {t(`common.spaceOption.${space}`)}
                </dt>
                <dd className="leading-tight tabular-nums">
                  <span
                    className={cx(
                      'block font-semibold',
                      count > 0 ? SPACE_TEXT[space] : 'text-text-dim'
                    )}
                  >
                    {count}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {flew !== null && (
        <p className="text-xs text-text-dim">
          {t('travel.pilot.list.flew')}: <span className="text-text">{flew}</span>
        </p>
      )}
    </li>
  );
}
