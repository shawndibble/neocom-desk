import type { RenderResult } from '@testing-library/react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { Industry } from '@/routes/Industry';
import { IndustryPlanPage } from '@/routes/IndustryPlanPage';
import { IndustryGroupPage } from '@/routes/IndustryGroupPage';
import { PlanetaryIndustry } from '@/routes/PlanetaryIndustry';
import { renderPageRoutes } from '@/test/renderPage';

export async function renderIndustryRoutes(): Promise<RenderResult> {
  await useActiveCharacter.getState().hydrate();
  return renderPageRoutes([
    ['/industry', <Industry key="industry" />],
    ['/industry/plans/:planId', <IndustryPlanPage key="plan" />],
    ['/industry/groups/:groupId', <IndustryGroupPage key="group" />],
    ['/planetary-industry', <PlanetaryIndustry key="pi" />],
  ]);
}
