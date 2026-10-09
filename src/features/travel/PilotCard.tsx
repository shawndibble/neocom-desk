/**
 * One pilot of a Local list as a phone card (below `sm`): portrait, name and
 * corporation, the 30-day kill count as the one big number, the Threat badge
 * and standing, then kills by space as a stat strip. Washed by Threat level so
 * a Dangerous pilot stands out while scrolling (decision `20261008-225809`).
 * At `sm` and up the same rows are a table.
 */
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { ageTone, type AgeTone, type KillSpace } from '@/engine/pilotList/killActivity';
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';
import { CharacterLink } from '@/features/entities';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import type { PilotListRow } from './pilotListData';
import { PilotStandingTag } from './PilotStandingTag';
import { SPACE_TEXT } from './pilotListStyles';
import { ThreatBadge } from './ThreatBadge';
import { THREAT_LEVEL_TONE, THREAT_ROW_CLASS, THREAT_TEXT_CLASS } from './threatTone';

const AGE_TEXT: Record<AgeTone, string> = {
  fresh: 'font-semibold text-text',
  week: 'text-text-dim',
  old: 'text-text-dim',
  none: 'text-text-dim',
};

export function PilotCard({
  row,
  threat,
  spaces,
  flew,
  now,
}: {
  row: PilotListRow;
  threat: ThreatLevel | 'pending' | null;
  spaces: readonly KillSpace[];
  /** Hull names already joined for display; null when there are none to show. */
  flew: string | null;
  now: number;
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
  const affiliation = [row.corporationName, row.allianceName].filter(Boolean).join(' · ');

  return (
    <li
      className={cx(
        'space-y-2 border border-l-2 border-line border-l-transparent bg-panel p-2.5',
        tone !== null && THREAT_ROW_CLASS[tone]
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
          {affiliation !== '' && (
            <div className="truncate text-xs text-text-dim">{affiliation}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <b
            className={cx(
              'block text-[1.625rem] leading-none font-semibold tabular-nums',
              tone !== null && THREAT_TEXT_CLASS[tone],
              threat === 'dangerous' && 'text-[2.125rem]'
            )}
          >
            {big}
          </b>
          <span className="text-[0.625rem] tracking-widest text-text-dim uppercase">
            {t('travel.pilot.list.killsLabel')}
          </span>
        </div>
      </div>

      {(threat !== null || row.standing !== null || own !== null || status !== null) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-dim">
          {threat !== null && <ThreatBadge level={threat} solid />}
          {own !== null && <span>{t(`travel.pilot.list.own.${own}`)}</span>}
          {row.standing !== null && <PilotStandingTag standing={row.standing} />}
          {status !== null && <span>{status}</span>}
        </div>
      )}

      {ready !== null && (
        <dl
          className="grid gap-px border border-line bg-line"
          style={{ gridTemplateColumns: `repeat(${spaces.length}, minmax(0, 1fr))` }}
        >
          {spaces.map((space) => {
            const { count, lastMs } = ready.bySpace[space];
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
                  <span className={cx('block text-[0.6875rem]', AGE_TEXT[ageTone(lastMs, now)])}>
                    {lastMs === null ? '—' : formatAge(now - lastMs, t)}
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
