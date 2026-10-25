// @ts-check
import { readFileSync } from 'node:fs'
import { test as base, expect } from '@playwright/test'

const fakeSupabase = readFileSync(new URL('./fake-supabase.js', import.meta.url), 'utf8')

// Tests never reach Supabase. By default the CDN script is answered with nothing, so the app runs
// signed out, local-only. With test.use({ cloud: 'fake' }) it gets e2e/fake-supabase.js instead: a
// signed-in user and an in-memory server. Routes are on the context so the service worker's requests
// are caught too.
export const test = base.extend({
  cloud: ['none', { option: true }],
  context: async ({ context, cloud }, use) => {
    await context.route('https://cdn.jsdelivr.net/npm/@supabase/**', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: cloud === 'fake' ? fakeSupabase : '' }),
    )
    await context.route('https://*.supabase.co/**', (route) => route.abort())
    await use(context)
  },
})

export { expect }

/** The "3 kicks today · 5 total" line under the Kick button. */
export const today = (page) => page.locator('#today')

/** What the fake server holds (cloud: 'fake' only). */
export const serverKicks = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('__fakeSupabase.db') || '{"kicks":[]}').kicks)
