import { defineConfig, devices } from '@playwright/test';

// Journey and acceptance tests run against a build made from the committed
// fixture (TALLY_DATA_SOURCE=fixture), so they never depend on the network.
export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.ts', 'acceptance/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4321' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The map draws with WebGL; headless runners have no GPU.
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
      },
    },
  ],
  webServer: {
    command: 'TALLY_DATA_SOURCE=fixture npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
