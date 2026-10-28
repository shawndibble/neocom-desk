import { useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Panel, SlideOver, Tabs, TabPanel, useTabsId } from '@/components/ui';
import { AlphaCloneChip } from './AlphaCloneChip';
import { RING_ROOM_ATTR } from './ring/useRingChrome';
import { type AddMode, editorColumnClass, editorGridClass } from './fittingLayout';
import type { FittingView } from './fittingViewPreference';

interface FittingEditorLayoutProps {
  addMode: AddMode;
  addOpen: boolean;
  addTitle: string;
  /** The module browser, shown docked, in the slide-out or in the sheet. */
  addPanel: ReactNode;
  onCloseAdd: () => void;
  /** The saved Ring | List choice has loaded; the page body waits for it. */
  viewHydrated: boolean;
  view: FittingView;
  onViewChange: (view: FittingView) => void;
  editor: ReactNode;
  statsSections: ReactNode;
  /** Something asked for the stats column (Improve's "See all in What to train"): a phone shows its Stats tab. */
  statsRequested?: boolean;
  /** Improve holds the left column on a narrower desktop: one column, the stats above the editor (`leftColumn`). */
  statsFirst?: boolean;
  /** Improve, open on desktop: a column left of the editor and stats, where the docked browser sits. */
  improveColumn?: ReactNode;
  /** The Alpha/Omega badge, at the far end of the phone's tab row. */
  alpha?: ComponentProps<typeof AlphaCloneChip>;
}

/**
 * Where the Fitting editor's parts sit: the phone's Ring / List / Stats tabs, or
 * the docked / slide-out browser beside the Ring | List column and the stats.
 * Also hosts the Add panel's sheet and slide-out wrappers.
 */
export function FittingEditorLayout({
  addMode,
  addOpen,
  addTitle,
  addPanel,
  onCloseAdd,
  viewHydrated,
  view,
  onViewChange,
  editor,
  statsSections,
  statsRequested = false,
  statsFirst = false,
  improveColumn,
  alpha,
}: FittingEditorLayoutProps) {
  const { t } = useTranslation();
  // Below desktop the Ring, the List and the stats are one set of tabs.
  const [phoneTab, setPhoneTab] = useState<'editor' | 'stats'>('editor');
  // One-shot on the request rising, so the pilot can still leave the Stats tab afterwards.
  const [statsSeen, setStatsSeen] = useState(statsRequested);
  if (statsSeen !== statsRequested) {
    setStatsSeen(statsRequested);
    if (statsRequested) setPhoneTab('stats');
  }
  // The tab bar renders on the phone sheet only.
  const viewTabsId = useTabsId();

  return (
    <>
      {viewHydrated &&
        (addMode === 'sheet' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Tabs
                className="min-w-0 flex-1"
                tabsId={viewTabsId}
                tabs={[
                  { id: 'ring', label: t('fittings.view.ring') },
                  { id: 'list', label: t('fittings.view.list') },
                  { id: 'stats', label: t('fittings.phoneTabs.stats') },
                ]}
                value={phoneTab === 'stats' ? 'stats' : view}
                onChange={(id) => {
                  if (id === 'stats') {
                    setPhoneTab('stats');
                    return;
                  }
                  setPhoneTab('editor');
                  onViewChange(id as FittingView);
                }}
                label={t('fittings.phoneTabs.label')}
              />
              {alpha && (
                <span className="shrink-0">
                  <AlphaCloneChip {...alpha} />
                </span>
              )}
            </div>
            <TabPanel
              tabsId={viewTabsId}
              tabId={phoneTab === 'stats' ? 'stats' : view}
              className="space-y-3"
            >
              {phoneTab === 'stats' ? statsSections : editor}
            </TabPanel>
          </div>
        ) : (
          <ImproveBeside column={improveColumn}>
            <div
              className={editorGridClass(
                addMode,
                view,
                addOpen || statsFirst,
                Boolean(improveColumn)
              )}
            >
              {addMode === 'docked' && (
                <Panel
                  title={addTitle}
                  className="sticky top-3 max-h-[calc(100vh-1.5rem)] overflow-y-auto"
                >
                  {addPanel}
                </Panel>
              )}
              {/* The Ring | List switch is in the editor panel's header. */}
              <div
                data-testid="fitting-editor-column"
                {...{ [RING_ROOM_ATTR]: '' }}
                className={`${editorColumnClass(view, addMode, addOpen || statsFirst)}${statsFirst ? ' order-last' : ''}`}
              >
                {editor}
              </div>
              {statsSections}
            </div>
          </ImproveBeside>
        ))}
      {addMode === 'sheet' && (
        <Modal open={addOpen} onClose={onCloseAdd} placement="sheet" title={addTitle}>
          {addPanel}
        </Modal>
      )}
      {addMode === 'slideOut' && (
        <SlideOver
          side="left"
          // Clears the app's 12rem nav, so it slides out where the docked column sits.
          className="md:left-48"
          open={addOpen}
          onClose={onCloseAdd}
          title={addTitle}
        >
          {addPanel}
        </SlideOver>
      )}
    </>
  );
}

/**
 * With Improve open, its column sits left of the editor grid, in the page's own
 * flow like the docked browser: it never covers the nav or the page header.
 */
function ImproveBeside({ column, children }: { column?: ReactNode; children: ReactNode }) {
  // The same element either way, so opening or closing Improve never remounts the
  // editor beside it (and loses its state): only the wrapper's display changes.
  return (
    <div className={column ? 'grid grid-cols-[24rem_minmax(0,1fr)] items-start gap-3' : 'contents'}>
      {column}
      {children}
    </div>
  );
}
