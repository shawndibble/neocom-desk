import { describeStorySmoke } from '@/test/storySmoke';

describeStorySmoke(
  import.meta.glob<Record<string, unknown>>(
    ['/src/**/*.stories.{ts,tsx}', '!/src/routes/**', '!/src/mockups/**'],
    { eager: true }
  )
);
