import { describeStorySmoke } from '@/test/storySmoke';

describeStorySmoke(
  import.meta.glob<Record<string, unknown>>(['/src/mockups/**/*.stories.{ts,tsx}'], { eager: true })
);
