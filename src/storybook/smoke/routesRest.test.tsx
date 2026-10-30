import { describeStorySmoke } from '@/test/storySmoke';

describeStorySmoke(
  import.meta.glob<Record<string, unknown>>(
    [
      '/src/routes/**/*.stories.{ts,tsx}',
      '!/src/routes/Srp.stories.tsx',
      '!/src/routes/CorpSrp.stories.tsx',
      '!/src/routes/CorpSrpOfficer.stories.tsx',
    ],
    { eager: true }
  )
);
