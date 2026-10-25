// @ts-check
import { expect, serverKicks, test, today } from './fixtures.js'

test.use({ cloud: 'fake' })

test('shows who is signed in', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#auth')).toContainText('Synced as parent@example.com')
})

test('sends kicks to the server', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await expect.poll(() => serverKicks(page)).toHaveLength(1)
  await page.getByRole('button', { name: 'Undo last kick' }).click()
  await expect.poll(() => serverKicks(page)).toHaveLength(0)
})

test('keeps kicks made offline and sends them once back online', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.locator('#auth')).toContainText('Synced as')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await expect(today(page)).toHaveText('2kicks today · 2 total')
  expect(await serverKicks(page)).toHaveLength(0)

  await context.setOffline(false)
  await expect.poll(() => serverKicks(page)).toHaveLength(2)
  await expect(today(page)).toHaveText('2kicks today · 2 total')
})

test('picks up kicks and the name from the server', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('__fakeSupabase.db', JSON.stringify({
      kicks: [{ id: crypto.randomUUID(), kicked_at: new Date().toISOString(), tag: 'Music', note: null }],
      profiles: [{ user_id: 'user-1', baby_name: 'Ada' }],
    }))
  })
  await page.reload()
  await expect(today(page)).toHaveText('1kick today · 1 total')
  await expect(page.locator('#hourTitle')).toHaveText('When does Ada kick most?')
  await expect(page.locator('#recent summary').first()).toContainText('Music')
})
