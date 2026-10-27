import type { Preview } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { FONT_SCALE_STEPS } from '@/lib/fontScale';
import { withAppShell } from '@/storybook/withAppShell';
import '@/styles/index.css';

// The app is dark-only (docs/DESIGN.md), so the backdrop is the page `bg` token
// and there is no theme switch to wire up.
const preview: Preview = {
  // Mirrors Settings -> Display -> text size: the app scales by setting
  // `<html>`'s font-size (`src/lib/fontScale.ts`), so stories do the same.
  globalTypes: {
    textSize: {
      description: 'Text size (Settings -> Display)',
      toolbar: {
        title: 'Text size',
        icon: 'zoom',
        dynamicTitle: true,
        items: FONT_SCALE_STEPS.map((step) => ({
          value: String(step),
          title: `${step * 100}%`,
        })),
      },
    },
  },
  initialGlobals: { textSize: '1' },
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    // 390 wide is the phone the design is checked at (docs/DESIGN.md §4a). A
    // story sets `globals: { viewport: { value: 'phone390' } }` to open there.
    viewport: {
      options: {
        phone390: {
          name: 'Phone (390)',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        // Between `md` and `lg`: where the Character picker is still an icon square.
        tablet768: {
          name: 'Tablet (768)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
      },
    },
    controls: { matchers: { date: /Date$/i } },
  },
  // Later entries wrap earlier ones: the shell sits inside the providers.
  decorators: [
    withAppShell,
    (Story, { globals }) => {
      document.documentElement.style.fontSize = `${Number(globals.textSize ?? 1) * 100}%`;
      return <Story />;
    },
    // Page stories (`parameters.shell`) carry the app's own chrome and router,
    // so they skip the padded backdrop and the plain MemoryRouter.
    (Story, { parameters }) => (
      <I18nextProvider i18n={i18n}>
        {parameters.shell ? (
          <div className="bg-bg text-text">
            <Story />
          </div>
        ) : (
          <MemoryRouter>
            <div className="min-h-screen bg-bg p-4 text-text">
              <Story />
            </div>
          </MemoryRouter>
        )}
      </I18nextProvider>
    ),
  ],
};

export default preview;
