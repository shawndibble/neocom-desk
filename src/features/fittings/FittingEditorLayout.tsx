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
  addPanel: ReactNode;
  onCloseAdd: () => void;
  viewHydrated: boolean;
  view: FittingView;
  onViewChange: (view: FittingView) => void;
  editor: ReactNode;
  statsSections: ReactNode;
  statsRequested?: boolean;
  statsFirst?: boolean;
  improveColumn?: ReactNode;
  alpha?: ComponentProps<typeof AlphaCloneChip>;
}

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
  const [phoneTab, setPhoneTab] = useState<'editor' | 'stats'>('editor');
  const [statsSeen, setStatsSeen] = useState(statsRequested);
  if (statsSeen !== statsRequested) {
    setStatsSeen(statsRequested);
    if (statsRequested) setPhoneTab('stats');
  }
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

function ImproveBeside({ column, children }: { column?: ReactNode; children: ReactNode }) {
  return (
    <div className={column ? 'grid grid-cols-[24rem_minmax(0,1fr)] items-start gap-3' : 'contents'}>
      {column}
      {children}
    </div>
  );
}
