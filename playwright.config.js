// @ts-check
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

// The app has no build: the tests serve the folder as it is (e2e/serve.js), the way GitHub Pages does.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-US',
    // Endless animations (like a breathing button) never settle, and Playwright waits for them to.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node e2e/serve.js`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
