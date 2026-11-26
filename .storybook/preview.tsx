import type { Preview } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { FONT_SCALE_STEPS } from '@/lib/fontScale';
import { withAppShell } from '@/storybook/withAppShell';
import '@/styles/index.css';

const preview: Preview = {
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
    viewport: {
      options: {
        phone390: {
          name: 'Phone (390)',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        tablet768: {
          name: 'Tablet (768)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
      },
    },
    controls: { matchers: { date: /Date$/i } },
  },
  decorators: [
    withAppShell,
    (Story, { globals }) => {
      document.documentElement.style.fontSize = `${Number(globals.textSize ?? 1) * 100}%`;
      return <Story />;
    },
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
