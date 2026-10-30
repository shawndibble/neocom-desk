/**
 * The Local list grouped by Organization (issue #5668): who owns this Local.
 * Alliance headings, a corporation sub-heading per corporation when two or
 * more of an alliance's are here, then "On their own" and anyone whose
 * corporation is not known. The grouping itself is `groupByOrganization`;
 * the rows under each heading are the Kills view's rows, passed in.
 *
 * A heading carries the logo, the name (Show Info), the pilot count, how many
 * read Dangerous or Active, and the Character's standing toward that
 * organization. On a phone each organization folds behind its heading, the
 * largest open, so the headings alone read as the roll call.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
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
  /** Off under an organization heading, which already names it. */
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
  const { sections, alone, unplaced } = groupByOrganization(rows);
  return (
    <>
      {sections.map((section, i) => (
        <OrgSectionView
          key={`${section.kind}-${section.id}`}
          section={section}
          startOpen={i === 0}
          threatOf={threatOf}
          renderRows={renderRows}
        />
      ))}
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
  startOpen,
  threatOf,
  renderRows,
}: {
  section: OrgSection<PilotListRow>;
  startOpen: boolean;
  threatOf: (row: PilotListRow) => Threat;
  renderRows: RenderPilotRows;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(startOpen);
  const name = section.name ?? t('travel.pilot.list.org.unnamed');
  const shown = !isPhone || open;
  const standing =
    standingVia(
      section.rows,
      section.kind === 'alliance' || section.alliance ? 'alliance' : null
    ) ?? standingVia(section.rows, 'corporation');
  return (
    <section className="space-y-2">
      <h3 className={SECTION_TITLE}>
        <OrgLogo kind={section.kind} id={section.id} size="md" />
        <OrgLink kind={section.kind} id={section.id}>
          {name}
        </OrgLink>
        {section.alliance !== null && (
          <span className="text-xs font-normal">
            <AllianceLink id={section.alliance.id}>
              {section.alliance.name ?? t('travel.pilot.list.org.unnamed')}
            </AllianceLink>
          </span>
        )}
        {standing !== null && <PilotStandingTag standing={standing} />}
        <Counts rows={section.rows} threatOf={threatOf} />
        {isPhone && (
          <IconButton
            className="ml-auto"
            size="sm"
            icon={open ? <Icon.Expanded /> : <Icon.Descend />}
            label={t(open ? 'travel.pilot.list.org.fold' : 'travel.pilot.list.org.unfold', {
              name,
            })}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
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
  const name = corporation.name ?? t('travel.pilot.list.org.unnamed');
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
  via: ContactStanding['via'] | null
): ContactStanding | null {
  if (via === null) return null;
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
