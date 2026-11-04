import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    // Installed browsers may not match the Playwright build; unset → default.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'mobile-chrome', testIgnore: /desktop\//, use: { ...devices['Pixel 5'] } },
    {
      name: 'desktop-chrome',
      testMatch: /desktop\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        timezoneId: 'Europe/Moscow',
        locale: 'ru-RU',
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
