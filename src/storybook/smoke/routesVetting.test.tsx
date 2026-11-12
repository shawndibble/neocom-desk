import { describeStorySmoke } from '@/test/storySmoke';

describeStorySmoke(
  import.meta.glob<Record<string, unknown>>(
    [
      '/src/routes/CorpVetting.stories.tsx',
      '/src/routes/VettingRequest.stories.tsx',
      '/src/routes/Apply.stories.tsx',
    ],
    { eager: true }
  )
);
