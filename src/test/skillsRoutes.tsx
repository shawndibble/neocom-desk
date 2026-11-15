import type { RenderResult } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { SkillDetailModal } from '@/components/SkillDetailModal';
import { EntityInfoRoute } from '@/features/entities';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { Skills } from '@/routes/Skills';
import { renderRoutesWithoutApp } from '@/test/routesWithoutApp';

/**
 * The Skills section's pages (Plans list, a plan's editor, Trained) at the
 * current `window.location`, without booting `App`. The App-level wiring (the
 * `/skills` redirect, the sub-nav across routes, the shell's sync note) stays in
 * `src/routes/SkillPlansApp.test.tsx`.
 */
export function renderSkillsRoutes(): RenderResult {
  return renderRoutesWithoutApp(
    <>
      <Route path="/skills/plans" element={<SkillPlans />} />
      <Route path="/skills/plans/:planId" element={<SkillPlanEditor />} />
      <Route path="/skills/trained" element={<Skills />} />
    </>,
    <>
      <EntityInfoRoute />
      {/* `App` mounts it lazily, only while one is asked for; `EntityInfoRoute`
      opens it from the URL's `?info=skill-<id>`. */}
      <SkillDetailModal />
    </>
  );
}
