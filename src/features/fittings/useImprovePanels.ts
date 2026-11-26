import { useId, useState } from 'react';
import type { ImproveGoal } from '@/engine/fittings/improve';

type PanelName = 'settings' | 'skills';

export function useImprovePanels(goal: ImproveGoal) {
  const settingsId = useId();
  const skillsId = useId();
  const moreId = useId();
  const goalsId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelName | null>(null);
  const togglePanel = (panel: PanelName) =>
    setOpenPanel((current) => (current === panel ? null : panel));
  const [panelGoal, setPanelGoal] = useState(goal);
  if (panelGoal !== goal) {
    setPanelGoal(goal);
    if (openPanel === 'skills') setOpenPanel(null);
  }
  const [skillsTrigger, setSkillsTrigger] = useState<HTMLElement | null>(null);
  const [skillsPanel, setSkillsPanel] = useState<HTMLElement | null>(null);
  return {
    settingsId,
    skillsId,
    moreId,
    goalsId,
    moreOpen,
    toggleMore: () => setMoreOpen((open) => !open),
    goalsOpen,
    toggleGoals: () => setGoalsOpen((open) => !open),
    settingsOpen: openPanel === 'settings',
    skillsOpen: openPanel === 'skills',
    togglePanel,
    skillsTrigger,
    setSkillsTrigger,
    skillsPanel,
    setSkillsPanel,
  };
}

export type ImprovePanels = ReturnType<typeof useImprovePanels>;
