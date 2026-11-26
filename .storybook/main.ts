import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: '@storybook/react-vite',
  features: { componentsManifest: true },
  viteFinal: (viteConfig) => {
    const appOnly =
      /^(vite-plugin-pwa|neocom-spa-fallback|neocom-landing-shell|neocom-lazy-chunks|neocom-shell-groups|neocom-release-file|sentry-)/;
    const strip = (plugins: unknown): unknown =>
      Array.isArray(plugins)
        ? plugins
            .map(strip)
            .filter(
              (p) => !(p && typeof p === 'object' && 'name' in p && appOnly.test(String(p.name)))
            )
        : plugins;
    return {
      ...viteConfig,
      plugins: strip(viteConfig.plugins) as typeof viteConfig.plugins,
      server: { ...viteConfig.server, port: undefined, strictPort: false },
    };
  },
};

export default config;
