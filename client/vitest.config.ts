import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/*
 * Client unit tests (Phase 3: API client, auth state, sign-in gate, account
 * pages). Reuses the app's Vite config — aliases and plugins — so a test
 * imports `@/…` exactly like the app does. jsdom stands in for the browser;
 * the network is a stubbed `fetch` per test (src/test/fetchStub.ts).
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
    },
  }),
)
