import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, Tabs } from '@/components/ui';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { loadDogmaEngine } from './dogmaFittingEngine';
import { FittingLoadCard } from './FittingLoadCard';
import { FittingStartScreen } from './FittingStartScreen';
import { HullPicker } from './HullPicker';
import { InGameFittingsPanel } from './InGameFittingsPanel';
import { MyFittingsPanel } from './MyFittingsPanel';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingLibrarySource } from './useFittingPicker';

export type LibraryTab = 'new' | 'import' | 'mine' | 'ingame';

interface FittingLibraryProps {
  /** The open workspace, or the Compare picker's stand-in that returns a Share Link code. */
  workspace: FittingLibrarySource;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  /** Remounts In-game Fittings so it refetches after a Save to EVE. */
  inGameKey: number;
  /** Omitted where a Fitting can't be started from a hull (Compare with...): the New tab is left out. */
  onStartHull?: (hull: HullEntry) => void;
  /** Called once any of the ways in here has opened a Fitting. */
  onOpened?: () => void;
  /**
   * `page`: the desktop Start screen with nothing open — one searchable list
   * of saved and In-game Fittings with a preview (`FittingStartScreen`).
   * `tabs`: one section at a time, for a phone's Start screen, the editor's
   * Fittings menu dialog and the Compare picker.
   */
  layout: 'page' | 'tabs';
  initialTab?: LibraryTab;
  /** The route's title, for the `page` layout, which renders the page header itself. */
  pageTitle?: string;
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
  pageTitle,
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
    new: onStartHull && (
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
        lastLoad={workspace.lastLoad}
        shareError={workspace.shareError}
        tooLargeToShare={workspace.tooLargeToShare}
        onLoadFittingXmlDocument={workspace.loadFittingXmlDocument}
        onOpenLoaded={async (loaded) => {
          await workspace.openLoaded(loaded);
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
            void workspace.openLoaded(loaded);
            onOpened?.();
          }}
        />
      ),
  };

  if (layout === 'page' && onStartHull) {
    return (
      <FittingStartScreen
        workspace={workspace}
        catalogue={catalogue}
        characterId={characterId}
        inGameKey={inGameKey}
        onStartHull={onStartHull}
        onOpened={onOpened}
        pageTitle={pageTitle}
      />
    );
  }

  const tabs = [
    ...(onStartHull ? [{ id: 'new', label: t('fittings.start.tabNew') }] : []),
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
