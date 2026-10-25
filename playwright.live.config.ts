import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { liveConfig } from './tests/live-config.mjs'
const config = liveConfig()
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
export default defineConfig({
  testDir: './tests/browser', testMatch: 'real-auth.spec.ts', timeout: 60_000,
  workers: 1, fullyParallel: false, reporter: [['list']], outputDir: 'test-results/live-auth',
  use: {
    baseURL: 'http://127.0.0.1:5174', trace: 'off', screenshot: 'off', video: 'off',
    launchOptions: existsSync(edge) ? { executablePath: edge } : {},
  },
  // Start a fresh server for the exact test project. Never reuse stale config.
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: config.key },
  },
  projects: [
    { name: 'desktop-live', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-live', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
