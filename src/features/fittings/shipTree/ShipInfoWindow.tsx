/**
 * The Ship Info window a hull opens (map click, ladder tap): the hull's
 * header, then four tabs as in game — Description, Fitting, Skills &
 * Mastery, Blueprint. On a desktop a right slide-over, non-modal so the
 * tree behind keeps steering it; on a phone a bottom sheet.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, SlideOver, TabPanel, Tabs, Toast, useTabsId } from '@/components/ui';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { useIsPhone } from '@/lib/useIsPhone';
import { romanLevel } from '@/engine/projection';
import { cx } from '@/lib/cx';
import { typeRenderUrl } from '@/lib/eveImages';
import type { ShipTreeShip } from '@/sde/types';
import { BlueprintTab } from './BlueprintTab';
import { DescriptionTab } from './DescriptionTab';
import { FittingTab } from './FittingTab';
import { FlyDot } from './FlyDot';
import { MasteryBadge } from './IsisTile';
import { SkillsMasteryTab, type AddedToPlan } from './SkillsMasteryTab';
import { flyLabel } from './flyLabel';
import { factionNameOf } from './shipTreeModel';
import type { ShipTreeSource } from './useShipTreeData';

type InfoTab = 'description' | 'fitting' | 'skills' | 'blueprint';
const TABS: readonly InfoTab[] = ['description', 'fitting', 'skills', 'blueprint'];
export function ShipInfoWindow({
  ship,
  source,
  onClose,
}: {
  ship: ShipTreeShip | null;
  source: ShipTreeSource;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const tabsId = useTabsId();
  const [tab, setTab] = useState<InfoTab>('description');
  // Here rather than in the tab, so Undo survives a tab switch or a new hull.
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const target = useTargetPlan(source.characterId);

  const body = ship && (
    <div className="space-y-3">
      <ShipInfoHeader ship={ship} source={source} />
      <Tabs
        tabsId={tabsId}
        label={t('ships.info.tabsLabel')}
        // A phone's sheet can't fit all four full labels.
        tabs={TABS.map((id) => ({
          id,
          label: t(isPhone ? `ships.info.tabsShort.${id}` : `ships.info.tabs.${id}`),
        }))}
        value={tab}
        onChange={(id) => setTab(id as InfoTab)}
      />
      {/* Keyed by hull: retargeting the window starts each tab afresh. */}
      <TabPanel key={ship.typeID} tabsId={tabsId} tabId={tab}>
        {tab === 'description' && <DescriptionTab ship={ship} source={source} />}
        {tab === 'fitting' && <FittingTab ship={ship} />}
        {tab === 'skills' && (
          <SkillsMasteryTab ship={ship} source={source} target={target} onAdded={setAdded} />
        )}
        {tab === 'blueprint' && <BlueprintTab ship={ship} characterId={source.characterId} />}
      </TabPanel>
      {added && (
        <Toast
          message={t('skills.fitCheck.addedToast', {
            count: added.entries.length,
            plan: added.planName,
          })}
          undo={{
            label: t('skills.fitCheck.addedToastUndo'),
            onUndo: () => {
              void target.removeEntries(added.planId, added.entries);
              setAdded(null);
            },
          }}
          onClose={() => setAdded(null)}
        />
      )}
    </div>
  );
  return (
    <InfoSurface open={ship !== null} title={ship?.name ?? ''} onClose={onClose} phone={isPhone}>
      {body}
    </InfoSurface>
  );
}

function InfoSurface({
  open,
  title,
  onClose,
  phone,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  phone: boolean;
  children: ReactNode;
}) {
  // One dismissal contract on both surfaces: Escape, the ✕ and Back close it.
  // Below `sm` it is a bottom sheet (grabber, swipe down, scrim). From `sm` up
  // — touch tablets included — it stays the non-modal `SlideOver`, because the
  // tree behind it must stay live to pick the next ship; `SlideOver` carries a
  // visible close button, Escape, and the shared Back hook, so a tablet needs
  // no sheet to get the same ways out.
  if (phone) {
    return open ? (
      <Modal open onClose={onClose} title={title} placement="sheet">
        {children}
      </Modal>
    ) : null;
  }
  return (
    <SlideOver open={open} onClose={onClose} title={title} className="max-w-[40rem]!">
      {children}
    </SlideOver>
  );
}

function ShipInfoHeader({ ship, source }: { ship: ShipTreeShip; source: ShipTreeSource }) {
  const { t } = useTranslation();
  const status = source.statuses.get(ship.typeID);
  const mastery = status?.mastery ?? 0;
  const faction = factionNameOf(source.data.factions, ship.factionID);
  const className = source.data.groups[String(ship.treeGroupID)]?.name ?? '';
  return (
    <div className="flex gap-3">
      <img
        src={typeRenderUrl(ship.typeID, 256)}
        crossOrigin="anonymous"
        alt=""
        className="h-28 w-28 shrink-0 rounded-xs border border-line object-cover"
      />
      <div className="min-w-0 space-y-1 text-sm">
        <div className="font-semibold">{ship.name}</div>
        <div className="text-text-dim">
          {t('ships.info.subtitle', {
            faction,
            class: className,
            tech: t('ships.info.tech', { level: ship.techLevel }),
          })}
        </div>
        <div className="flex items-center gap-2">
          <FlyDot status={status} />
          <span>{flyLabel(t, status)}</span>
        </div>
        <div className="flex items-center gap-2 text-text-dim">
          <MasteryBadge
            mastery={mastery}
            className={cx(
              'inline-flex items-center gap-px',
              mastery >= 5 ? 'text-mastery-elite' : 'text-text-dim'
            )}
            ringClassName="flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1 text-[0.625rem] font-bold"
          />
          <span>
            {mastery
              ? t('ships.info.mastery', { level: romanLevel(mastery) })
              : t('ships.info.masteryNone')}
          </span>
        </div>
      </div>
    </div>
  );
}
