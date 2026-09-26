/**
 * The Ship Info window a hull opens (map click, ladder tap): the hull's
 * header, then four tabs as in game — Description, Fitting, Skills &
 * Mastery, Blueprint. On a desktop a right slide-over, non-modal so the
 * tree behind keeps steering it; on a phone a bottom sheet.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, SlideOver, Tabs, Toast } from '@/components/ui';
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
import { Wing } from './IsisTile';
import { SkillsMasteryTab, type AddedToPlan } from './SkillsMasteryTab';
import { flyLabel } from './flyLabel';
import type { ShipTreeSource } from './useShipTreeData';

type InfoTab = 'description' | 'fitting' | 'skills' | 'blueprint';
const TABS: readonly InfoTab[] = ['description', 'fitting', 'skills', 'blueprint'];
const TOAST_MS = 8000;

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
  const [tab, setTab] = useState<InfoTab>('description');
  // Here rather than in the tab, so Undo survives a tab switch or a new hull.
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const target = useTargetPlan(source.characterId);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [added]);

  const body = ship && (
    <div className="space-y-3">
      <ShipInfoHeader ship={ship} source={source} />
      <Tabs
        label={t('ships.info.tabsLabel')}
        // A phone's sheet can't fit all four full labels; the tabpanel keeps the full name.
        tabs={TABS.map((id) => ({
          id,
          label: t(isPhone ? `ships.info.tabsShort.${id}` : `ships.info.tabs.${id}`),
        }))}
        value={tab}
        onChange={(id) => setTab(id as InfoTab)}
      />
      {/* Keyed by hull: retargeting the window starts each tab afresh. */}
      <div key={ship.typeID} role="tabpanel" aria-label={t(`ships.info.tabs.${tab}`)}>
        {tab === 'description' && <DescriptionTab ship={ship} source={source} />}
        {tab === 'fitting' && <FittingTab ship={ship} />}
        {tab === 'skills' && (
          <SkillsMasteryTab ship={ship} source={source} target={target} onAdded={setAdded} />
        )}
        {tab === 'blueprint' && <BlueprintTab ship={ship} characterId={source.characterId} />}
      </div>
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
  const faction = source.data.factions.find((f) => f.id === ship.factionID)?.name ?? '';
  const className = source.data.groups[String(ship.treeGroupID)]?.name ?? '';
  return (
    <div className="flex gap-3">
      <img
        src={typeRenderUrl(ship.typeID, 256)}
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
          <span
            aria-hidden="true"
            className={cx(
              'inline-flex items-center gap-px',
              mastery >= 5 ? 'text-mastery-elite' : 'text-text-dim'
            )}
          >
            <Wing />
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1 text-[0.625rem] font-bold">
              {mastery ? romanLevel(mastery) : ''}
            </span>
            <Wing flip />
          </span>
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
