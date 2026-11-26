import type { RenderResult } from '@testing-library/react';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { Skills } from '@/routes/Skills';
import { renderPageRoutes } from '@/test/renderPage';

export function renderSkillsRoutes(): RenderResult {
  return renderPageRoutes([
    ['/skills/plans', <SkillPlans key="plans" />],
    ['/skills/plans/:planId', <SkillPlanEditor key="editor" />],
    ['/skills/trained', <Skills key="trained" />],
  ]);
}
