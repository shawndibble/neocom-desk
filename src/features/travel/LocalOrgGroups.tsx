/**
 * The Local list's Organization view (issue #5668): `groupByOrganization`'s
 * headings over the Kills view's own rows, passed in as `renderRows`. On a
 * phone each organization folds, the largest open, so the headings read as the roll call.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, IconButton } from '@/components/ui';
import {
  groupByOrganization,
  type CorporationGroup,
  type OrgSection,
} from '@/engine/pilotList/orgGroups';
import type { ContactStanding } from '@/engine/pilotList/standing';
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';
import { AllianceLink, CorporationLink } from '@/features/entities';
import { allianceLogoUrl, corporationLogoUrl } from '@/lib/eveImages';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import type { PilotListRow } from './pilotListData';
import { PilotStandingTag } from './PilotStandingTag';

type Threat = ThreatLevel | 'pending' | null;

export type RenderPilotRows = (
  label: string,
  rows: PilotListRow[],
  /** Off where the heading names it, or nothing is known. */
  showAffiliation: boolean
) => ReactNode;

const SECTION_TITLE = 'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-text';

export function LocalOrgGroups({
  rows,
  threatOf,
  renderRows,
}: {
  /** Found, non-friendly pilots. */
  rows: PilotListRow[];
  threatOf: (row: PilotListRow) => Threat;
  renderRows: RenderPilotRows;
}) {
  const { t } = useTranslation();
  const { sections, alone, unplaced } = useMemo(() => groupByOrganization(rows), [rows]);
  // Keyed by organization, not position: the largest stays open by default even
  // when names arriving re-sort equal-sized groups.
  const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(new Map());
  return (
    <>
      {sections.map((section, i) => {
        const key = `${section.kind}-${section.id}`;
        const open = folds.get(key) ?? i === 0;
        return (
          <OrgSectionView
            key={key}
            section={section}
            open={open}
            onToggle={() => setFolds((prev) => new Map(prev).set(key, !open))}
            threatOf={threatOf}
            renderRows={renderRows}
          />
        );
      })}
      {alone.length > 0 && (
        <section className="space-y-2">
          <h3 className={SECTION_TITLE}>
            {t('travel.pilot.list.org.alone')}
            <span className="text-xs font-normal text-text-dim">
              {t('travel.pilot.list.groupCount', { count: alone.length })} ·{' '}
              {t('travel.pilot.list.org.aloneNote')}
            </span>
          </h3>
          {renderRows(t('travel.pilot.list.org.alone'), alone, true)}
        </section>
      )}
      {unplaced.length > 0 && (
        <section className="space-y-2">
          <h3 className={SECTION_TITLE}>
            {t('travel.pilot.list.org.unplaced')}
            <span className="text-xs font-normal text-text-dim">
              {t('travel.pilot.list.groupCount', { count: unplaced.length })}
            </span>
          </h3>
          {renderRows(t('travel.pilot.list.org.unplaced'), unplaced, false)}
        </section>
      )}
    </>
  );
}

function OrgSectionView({
  section,
  open,
  onToggle,
  threatOf,
  renderRows,
}: {
  section: OrgSection<PilotListRow>;
  /** Phone only: desktop never folds. */
  open: boolean;
  onToggle: () => void;
  threatOf: (row: PilotListRow) => Threat;
  renderRows: RenderPilotRows;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const name = section.name ?? t('travel.pilot.list.org.unnamed', { id: section.id });
  const shown = !isPhone || open;
  // An alliance heading shows only an alliance contact: one corporation's contact is not the alliance's.
  const standing =
    standingVia(section.rows, 'alliance') ??
    (section.kind === 'corporation' ? standingVia(section.rows, 'corporation') : null);
  return (
    <section className="space-y-2">
      <h3 className={SECTION_TITLE}>
        <OrgLogo kind={section.kind} id={section.id} size="md" />
        <OrgLink kind={section.kind} id={section.id}>
          {name}
        </OrgLink>
        {section.kind === 'corporation' && section.alliance !== null && (
          <span className="text-xs font-normal">
            <AllianceLink id={section.alliance.id} className="text-text-dim">
              {section.alliance.name ??
                t('travel.pilot.list.org.unnamed', { id: section.alliance.id })}
            </AllianceLink>
          </span>
        )}
        {standing !== null && <PilotStandingTag standing={standing} />}
        <Counts rows={section.rows} threatOf={threatOf} />
        {isPhone && (
          <IconButton
            className="ml-auto"
            size="sm"
            icon={<Caret expanded={open} />}
            label={t(open ? 'travel.pilot.list.org.fold' : 'travel.pilot.list.org.unfold', {
              name,
            })}
            aria-expanded={open}
            onClick={onToggle}
          />
        )}
      </h3>
      {shown &&
        (section.kind === 'alliance' ? (
          <div className="space-y-3 border-l-2 border-line pl-3 sm:pl-4">
            {section.corporations.map((corporation) => (
              <CorporationView
                key={corporation.id}
                corporation={corporation}
                threatOf={threatOf}
                renderRows={renderRows}
              />
            ))}
          </div>
        ) : (
          renderRows(name, section.rows, false)
        ))}
    </section>
  );
}

function CorporationView({
  corporation,
  threatOf,
  renderRows,
}: {
  corporation: CorporationGroup<PilotListRow>;
  threatOf: (row: PilotListRow) => Threat;
  renderRows: RenderPilotRows;
}) {
  const { t } = useTranslation();
  const name = corporation.name ?? t('travel.pilot.list.org.unnamed', { id: corporation.id });
  const standing = standingVia(corporation.rows, 'corporation');
  return (
    <div className="space-y-1.5">
      <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-text">
        <OrgLogo kind="corporation" id={corporation.id} size="sm" />
        <CorporationLink id={corporation.id}>{name}</CorporationLink>
        {standing !== null && <PilotStandingTag standing={standing} />}
        <Counts rows={corporation.rows} threatOf={threatOf} />
      </h4>
      {renderRows(name, corporation.rows, false)}
    </div>
  );
}

/** The standing every pilot of the group shares through that organization's contact, if any. */
function standingVia(
  rows: readonly PilotListRow[],
  via: ContactStanding['via']
): ContactStanding | null {
  return rows.find((row) => row.standing?.via === via)?.standing ?? null;
}

function Counts({
  rows,
  threatOf,
}: {
  rows: readonly PilotListRow[];
  threatOf: (row: PilotListRow) => Threat;
}) {
  const { t } = useTranslation();
  let dangerous = 0;
  let active = 0;
  for (const row of rows) {
    const threat = threatOf(row);
    if (threat === 'dangerous') dangerous += 1;
    else if (threat === 'active') active += 1;
  }
  return (
    <span className="flex flex-wrap gap-x-1.5 text-xs font-normal text-text-dim">
      {t('travel.pilot.list.groupCount', { count: rows.length })}
      {dangerous > 0 && (
        <span className="text-danger">
          · {t('travel.pilot.list.org.dangerous', { count: dangerous })}
        </span>
      )}
      {active > 0 && (
        <span className="text-warning">
          · {t('travel.pilot.list.org.active', { count: active })}
        </span>
      )}
    </span>
  );
}

function OrgLink({
  kind,
  id,
  children,
}: {
  kind: OrgSection<PilotListRow>['kind'];
  id: number;
  children: ReactNode;
}) {
  return kind === 'alliance' ? (
    <AllianceLink id={id}>{children}</AllianceLink>
  ) : (
    <CorporationLink id={id}>{children}</CorporationLink>
  );
}

function OrgLogo({
  kind,
  id,
  size,
}: {
  kind: OrgSection<PilotListRow>['kind'];
  id: number;
  size: 'md' | 'sm';
}) {
  const src = kind === 'alliance' ? allianceLogoUrl(id, 64) : corporationLogoUrl(id, 64);
  return (
    <img
      src={src}
      crossOrigin="anonymous"
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={size === 'md' ? 24 : 20}
      height={size === 'md' ? 24 : 20}
      className={cx(
        'shrink-0 rounded-xs border border-line bg-panel-2',
        size === 'md' ? 'size-6' : 'size-5'
      )}
    />
  );
}
