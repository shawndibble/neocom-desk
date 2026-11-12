import { describeStorySmoke } from '@/test/storySmoke';

describeStorySmoke(
  import.meta.glob<Record<string, unknown>>(
    [
      '/src/routes/**/*.stories.{ts,tsx}',
      '!/src/routes/Srp.stories.tsx',
      '!/src/routes/CorpSrp.stories.tsx',
      '!/src/routes/CorpSrpOfficer.stories.tsx',
      '!/src/routes/CorpVetting.stories.tsx',
      '!/src/routes/VettingRequest.stories.tsx',
      '!/src/routes/Apply.stories.tsx',
    ],
    { eager: true }
  )
);
