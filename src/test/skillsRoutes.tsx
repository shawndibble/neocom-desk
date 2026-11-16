import type { RenderResult } from '@testing-library/react';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { Skills } from '@/routes/Skills';
import { renderPageRoutes } from '@/test/renderPage';

/**
 * The Skills section's pages (Plans list, a plan's editor, Trained) at the
 * current `window.location`, through `renderPageRoutes`. The App-level wiring
 * (the `/skills` redirect, the sub-nav across routes, the shell's sync note)
 * stays in `src/routes/SkillPlansApp.test.tsx`.
 */
export function renderSkillsRoutes(): RenderResult {
  return renderPageRoutes([
    ['/skills/plans', <SkillPlans key="plans" />],
    ['/skills/plans/:planId', <SkillPlanEditor key="editor" />],
    ['/skills/trained', <Skills key="trained" />],
  ]);
}
