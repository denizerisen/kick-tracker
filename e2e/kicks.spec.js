// @ts-check
import { expect, test, today } from './fixtures.js'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('opens empty, without errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kick Tracker' })).toBeVisible()
  await expect(today(page)).toHaveText('0kicks today · 0 total')
  await expect(page.locator('#peak')).toHaveText('Tap Kick! to start finding the pattern.')
  expect(errors).toEqual([])
})

test('logs kicks, undoes the last one, and keeps them after a reload', async ({ page }) => {
  const kick = page.getByRole('button', { name: 'Log a kick' })
  await kick.click()
  await expect(today(page)).toHaveText('1kick today · 1 total')
  await kick.click()
  await kick.click()
  await expect(today(page)).toHaveText('3kicks today · 3 total')
  await page.getByRole('button', { name: 'Undo last kick' }).click()
  await expect(today(page)).toHaveText('2kicks today · 2 total')
  await page.reload()
  await expect(today(page)).toHaveText('2kicks today · 2 total')
})

test('logs past kicks and moves the form on a minute', async ({ page }) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  await page.getByLabel('Date').fill(date)
  await page.getByLabel('Time').fill('09:30')
  await page.getByLabel('Number of kicks').fill('3')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(today(page)).toHaveText('0kicks today · 3 total')
  await expect(page.getByLabel('Time')).toHaveValue('09:31')
  await expect(page.getByLabel('Number of kicks')).toHaveValue('1')
  await expect(page.locator('#peak')).toHaveText('Most active around 9 AM')
})

test('charts show the kicks', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await expect(page.locator('#hourChart rect.has-data')).toHaveCount(1)
  await expect(page.locator('#dayChart rect.has-data')).toHaveCount(1)
  await expect(page.locator('#peak')).toContainText('Most active around')
})

test('tags the live session and shows it in recent sessions', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a kick' }).click()
  const live = page.locator('#live')
  await expect(live).toContainText('This session · 1 kick since')
  await live.getByRole('button', { name: 'Coffee' }).click()
  await expect(live.getByRole('button', { name: 'Coffee' })).toHaveAttribute('aria-pressed', 'true')
  await live.getByLabel('Note for this session').fill('after breakfast')
  await live.getByLabel('Note for this session').press('Enter')

  const session = page.locator('#recent summary').first()
  await expect(session).toContainText('Coffee')
  await expect(session).toContainText('after breakfast')

  // a kick that joins the session picks up its tag
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await expect(session).toContainText('2 kicks')
  await expect(session).toContainText('Coffee')
})

test('adds a custom tag', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a kick' }).click()
  const live = page.locator('#live')
  await live.getByRole('button', { name: 'Add your own tag' }).click()
  await live.getByLabel('Your tag').fill('Bath')
  await live.getByLabel('Your tag').press('Enter')
  await expect(page.locator('#recent summary').first()).toContainText('Bath')
})

test('deletes a kick from recent sessions', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await page.locator('#recent summary').first().click()
  await page.locator('#recent').getByRole('button', { name: 'delete' }).first().click()
  await expect(today(page)).toHaveText('1kick today · 1 total')
})

test('opens one session at a time without moving the tapped row or the page', async ({ page }) => {
  // eight sessions of four kicks, an hour apart
  await page.evaluate(() => {
    const now = Date.now()
    const kicks = []
    for (let s = 0; s < 8; s++) {
      for (let i = 0; i < 4; i++) kicks.push({ id: crypto.randomUUID(), ts: now - s * 3600e3 - i * 30e3, synced: true })
    }
    localStorage.setItem('kicktracker.kicks', JSON.stringify(kicks))
  })
  await page.reload()
  const rows = page.locator('#recent summary')
  const top = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().top))

  await rows.nth(0).click()
  await rows.nth(3).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const rowBefore = await top(rows.nth(3))
  await rows.nth(3).click()

  await expect(page.locator('#recent details[open]')).toHaveCount(1)
  await expect(page.locator('#recent details').nth(3)).toHaveAttribute('open', '')
  // closing the open row above used to pull the tapped one up the screen
  expect(Math.abs((await top(rows.nth(3))) - rowBefore)).toBeLessThanOrEqual(1)
  // on desktop the list used to grow and push the cards beside it down (measured on the page,
  // since clicking may scroll)
  if (!test.info().project.name.includes('phone')) {
    const pageTop = () => page.locator('.g-past').evaluate((el) => Math.round(el.getBoundingClientRect().top + scrollY))
    const before = await pageTop()
    await rows.nth(3).click()
    await rows.nth(0).click()
    expect(await pageTop()).toBe(before)
  }
})

test("names the baby in the headings and keeps the name", async ({ page }) => {
  await page.getByRole('button', { name: "Add baby's name" }).click()
  await page.getByLabel("Baby's name").fill('Ada')
  await page.getByLabel("Baby's name").press('Enter')
  await expect(page.locator('#hourTitle')).toHaveText('When does Ada kick most?')
  await expect(page.locator('#dayTitle')).toHaveText("Ada's kicks per day")
  await page.reload()
  await expect(page.locator('#hourTitle')).toHaveText('When does Ada kick most?')
})

test('exports kicks and imports them back', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Log a kick' }).click()
  await page.getByRole('button', { name: 'Log a kick' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const file = testInfo.outputPath('kicks.json')
  await (await downloading).saveAs(file)

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(today(page)).toHaveText('0kicks today · 0 total')
  await page.locator('#import').setInputFiles(file)
  await expect(today(page)).toHaveText('2kicks today · 2 total')
})

test('the home-screen shortcut logs a kick', async ({ page }) => {
  await page.goto('./?kick=1')
  await expect(today(page)).toHaveText('1kick today · 1 total')
  expect(new URL(page.url()).search).toBe('')
})
