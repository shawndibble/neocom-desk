import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, Tabs } from '@/components/ui';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { loadDogmaEngine } from './dogmaFittingEngine';
import { FittingLoadCard } from './FittingLoadCard';
import { HullPicker } from './HullPicker';
import { InGameFittingsPanel } from './InGameFittingsPanel';
import { MyFittingsPanel } from './MyFittingsPanel';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingWorkspace } from './useFittingWorkspace';

export type LibraryTab = 'new' | 'import' | 'mine' | 'ingame';

interface FittingLibraryProps {
  workspace: FittingWorkspace;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  /** Remounts In-game Fittings so it refetches after a Save to EVE. */
  inGameKey: number;
  onStartHull: (hull: HullEntry) => void;
  /** Called once any of the ways in here has opened a Fitting. */
  onOpened?: () => void;
  /**
   * `page`: the Start screen with nothing open — the hull picker beside Import
   * and the fitting lists. `tabs`: one section at a time, for a phone's Start
   * screen and for the editor's Fittings menu dialog.
   */
  layout: 'page' | 'tabs';
  initialTab?: LibraryTab;
}

/**
 * Every way into a Fitting (scope decision `20260924-215855`): start from a
 * hull, Load one (EFT, links, EVE XML), or open a saved or In-game one. The
 * Start screen's whole content, and what the Fittings menu reopens once a
 * Fitting is open, so the two can never drift apart.
 */
export function FittingLibrary({
  workspace,
  catalogue,
  characterId,
  inGameKey,
  onStartHull,
  onOpened,
  layout,
  initialTab = 'new',
}: FittingLibraryProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<LibraryTab>(initialTab);

  // Start the ship data downloading now, so a hull opened from here shows
  // its slots at once rather than after the first cold download.
  useEffect(() => {
    void loadDogmaEngine().catch(() => {
      // Stats report their own failure once a Fitting is open.
    });
  }, []);

  const sections: Record<LibraryTab, ReactNode> = {
    new: (
      <HullPicker
        catalogue={catalogue}
        onStart={(hull) => {
          onStartHull(hull);
          onOpened?.();
        }}
      />
    ),
    import: (
      <FittingLoadCard
        onLoad={workspace.loadFromInput}
        unresolved={workspace.unresolved}
        fitXmlUnresolved={workspace.fitXmlUnresolved}
        shareError={workspace.shareError}
        loadError={workspace.loadError}
        tooLargeToShare={workspace.tooLargeToShare}
        onLoadFittingXmlDocument={workspace.loadFittingXmlDocument}
        onOpenFittingXmlEntry={async (item) => {
          await workspace.openFittingXmlEntry(item);
          onOpened?.();
        }}
      />
    ),
    mine: (
      <MyFittingsPanel
        characterId={characterId}
        onOpen={(record) => {
          workspace.openSaved(record);
          onOpened?.();
        }}
      />
    ),
    ingame:
      characterId === null ? null : (
        <InGameFittingsPanel
          key={inGameKey}
          characterId={characterId}
          onOpen={(loaded) => {
            void workspace.openFitting(loaded);
            onOpened?.();
          }}
        />
      ),
  };

  if (layout === 'page') {
    return (
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel title={t('fittings.start.newTitle')}>{sections.new}</Panel>
        <div className="space-y-3">
          {sections.import}
          {sections.mine}
          {sections.ingame}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'new', label: t('fittings.start.tabNew') },
    { id: 'import', label: t('fittings.start.tabImport') },
    { id: 'mine', label: t('fittings.myFittings.title') },
    ...(characterId === null ? [] : [{ id: 'ingame', label: t('fittings.start.tabInGame') }]),
  ];
  return (
    <div className="space-y-3">
      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(id) => setTab(id as LibraryTab)}
        label={t('fittings.start.tabsLabel')}
      />
      {tab === 'new' ? (
        <Panel title={t('fittings.start.newTitle')}>{sections.new}</Panel>
      ) : (
        sections[tab]
      )}
    </div>
  );
}
