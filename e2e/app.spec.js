// @ts-check
import { expect, test } from './fixtures.js'

test('switches to Turkish and remembers it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Türkçe’ye geç' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.getByRole('button', { name: 'Tekme kaydet' })).toHaveText('Tekme!')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tekme Takibi' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await expect(page.getByRole('heading', { name: 'Kick Tracker' })).toBeVisible()
})

test('switches the theme and remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await page.getByRole('button', { name: 'Toggle light and dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('opens offline once visited, and logs kicks there', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // the service worker now controls the page and has cached the shell
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kick Tracker' })).toBeVisible()
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await expect(page.locator('#today')).toHaveText('1kick today · 1 total')
})
