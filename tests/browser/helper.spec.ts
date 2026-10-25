import { test, expect, type Page } from '@playwright/test'
import { sampleWorkspace } from '../../src/demo'

async function open(page: Page) { await page.getByRole('button', { name: 'Help', exact: true }).click(); return page.getByRole('dialog', { name: 'BizBridge Helper' }) }
async function demo(page: Page) { await page.goto('/'); await page.getByRole('button', { name: 'Explore demo', exact: true }).click(); await expect(page.locator('main h1')).toBeVisible() }
async function ask(page: Page, question: string) { await page.getByLabel('Ask a supported question', { exact: true }).fill(question); await page.getByRole('button', { name: 'Send question' }).click() }
const answer = (page: Page) => page.locator('.helper-answer').last()
const close = (page: Page) => page.getByRole('button', { name: 'Close BizBridge Helper' }).click()

test('generic help, literal text, unsupported choices and navigation use existing pages', async ({ page }) => {
  await page.goto('/'); const panel = await open(page)
  await expect(panel).toContainText('not a generative-AI chatbot')
  await ask(page, 'business summary'); await expect(answer(page)).toContainText('Sign in')
  await ask(page, '<img src=x onerror=alert(1)>'); await expect(answer(page)).toContainText('Please choose a topic below')
  await expect(panel.locator('img')).toHaveCount(0)
  await close(page); await page.getByRole('button', { name: 'Explore demo', exact: true }).click()
  for (const [question, action, heading] of [['add item','Open Products','Products & stock'],['record sale','Open Sales','Sales'],['record expense','Open Expenses','Operating expenses']]) {
    await open(page); await ask(page, question); await answer(page).getByRole('button', { name: action, exact: true }).click()
    await expect(page.locator('main h1')).toHaveText(heading); await expect(page.getByRole('dialog')).toHaveCount(0)
  }
})

test('summary matches dashboard period, stays current after saved demo sale and expense', async ({ page }) => {
  await demo(page); await page.getByLabel('Reporting period').selectOption('all')
  const expected = await page.locator('.stat-value').allTextContents()
  await open(page); await ask(page, 'business summary')
  await expect(answer(page)).toContainText('Reporting period: All time')
  await expect(answer(page)).toContainText('Retrieved')
  expect(await answer(page).locator('dd').allTextContents()).toEqual(expected.slice(0,5))
  await ask(page, 'record sale'); await answer(page).getByRole('button', { name: 'Open Sales', exact: true }).click()
  await page.getByRole('button', { name: 'Record sale', exact: true }).click(); await page.getByLabel('Quantity', { exact: true }).fill('2'); await page.getByRole('button', { name: 'Record completed sale' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await open(page); await ask(page, 'record expense'); await answer(page).getByRole('button', { name: 'Open Expenses', exact: true }).click()
  await page.getByRole('button', { name: 'Add expense', exact: true }).click(); await page.getByLabel('Amount (R)', { exact: true }).fill('30'); await page.getByRole('button', { name: 'Record expense', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await open(page)
  // Existing answer updates from the current workspace without another question.
  await expect(page.locator('.helper-answer').first().locator('dd').last()).toContainText('140')
  await ask(page, 'summary'); await expect(answer(page)).toContainText('Reporting period: All time')
  await close(page); await page.goto('/sales?new=1')
  await page.getByLabel('Product', { exact: true }).selectOption({ label: 'Laundry liquid · 2L (12 available)' }); await page.getByRole('button', { name: 'Record completed sale' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/dashboard'); const warning = await page.locator('.notice.warning').textContent()
  await open(page); await ask(page, 'summary'); await expect(answer(page).locator('.helper-warning')).toHaveText(warning!.trim()); await expect(answer(page).getByText('Incomplete', { exact: true })).toHaveCount(3)
})

test('helper interactions make no network requests, mutate no records and retain no chat storage', async ({ page }) => {
  await demo(page)
  const requests: string[] = []; page.on('request', request => requests.push(request.url()))
  const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
  await open(page)
  for (const question of ['add item', 'record sale', 'record expense', 'summary', 'low stock', 'readiness', 'gross profit', 'sales and expenses', 'delete all sales']) await ask(page, question)
  await expect(answer(page)).toContainText('read-only')
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(before)
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'Clear conversation' }).click(); await expect(page.locator('.helper-turn')).toHaveCount(0)
  await expect(page.getByLabel('Ask a supported question')).toBeFocused()
})

test('private conversation clears on account, business, mode and logout changes', async ({ page }) => {
  await page.goto('/tests/helper-harness.html')
  // First change only the business, then the account, mode and authentication.
  for (const state of ['business-b','real-b','demo','anonymous']) {
    await open(page); await ask(page, 'summary'); await ask(page, 'private note for this session')
    await page.getByLabel('Test context').selectOption(state)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await open(page); await expect(page.locator('.helper-turn')).toHaveCount(0); await expect(page.getByRole('dialog')).not.toContainText('private note for this session')
    await ask(page, 'summary')
    if (state === 'demo') await expect(answer(page)).toContainText('DEMO MODE — fictional')
    if (state === 'anonymous') { await expect(answer(page)).toContainText('Sign in'); await expect(answer(page).locator('dd')).toHaveCount(0) }
    await close(page)
  }
})

test('empty, loading and failed data remain distinct and visible answers update', async ({ page }) => {
  await page.goto('/tests/helper-harness.html'); await open(page); await ask(page, 'summary')
  await page.getByLabel('Test context').selectOption('failed'); await expect(answer(page)).toContainText('Unable to load'); await expect(answer(page).locator('dd')).toHaveCount(0)
  await ask(page, 'low stock'); await expect(answer(page)).toContainText('Unable to load stock information')
  await page.getByLabel('Test context').selectOption('loading'); await expect(answer(page)).toContainText('still loading')
  await page.getByLabel('Test context').selectOption('empty'); await expect(answer(page)).toContainText('No products yet')
  await ask(page, 'readiness'); await expect(answer(page)).toContainText('Readiness: not started')
  await ask(page, 'summary'); await expect(answer(page)).toContainText('No sales or operating expenses')
})

test('late workspace response cannot repopulate a different account helper', async ({ page }) => {
  // All backend traffic is intercepted. No real users or records are touched.
  await page.route('https://*.supabase.co/**', route => route.abort())
  let release!: () => void, started!: () => void
  const pending = new Promise<void>(resolve => { release = resolve }), firstStarted = new Promise<void>(resolve => { started = resolve })
  let calls = 0
  await page.route('**/rest/v1/rpc/get_workspace', async route => {
    const first = ++calls === 1, data = sampleWorkspace(), owner = first ? 'fixture-a' : 'fixture-b'
    data.business = { ...data.business!, id: owner, owner_id: owner, name: first ? 'OLD PRIVATE BUSINESS' : 'CURRENT BUSINESS B' }
    if (first) { started(); await pending }
    await route.fulfill({ json: data })
  })
  await page.goto('/tests/helper-harness.html'); await page.getByLabel('Test context').selectOption('remote-a'); await firstStarted
  await open(page); await ask(page, 'summary'); await expect(answer(page)).toContainText('still loading')
  await page.getByLabel('Test context').selectOption('remote-b'); await open(page); await ask(page, 'summary'); await expect(answer(page)).toContainText('CURRENT BUSINESS B')
  const lateResponse = page.waitForResponse('**/rest/v1/rpc/get_workspace')
  release(); await (await lateResponse).finished()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(answer(page)).toContainText('CURRENT BUSINESS B'); await expect(answer(page)).not.toContainText('OLD PRIVATE BUSINESS')
  expect(calls).toBe(2)
})

test('keyboard access, focus return and narrow short-viewport controls', async ({ page }, testInfo) => {
  await demo(page)
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 740 })
  const trigger = page.getByRole('button', { name: 'Help', exact: true }); await trigger.focus(); await page.keyboard.press('Enter')
  await expect(page.getByLabel('Ask a supported question')).toBeFocused()
  await page.keyboard.type('low stock')
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Send question' })).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(page.getByLabel('Ask a supported question')).toBeFocused()
  await page.keyboard.press('Enter'); await expect(answer(page)).toContainText('threshold 5')
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await trigger.press('Enter'); await page.getByRole('button', { name: 'Clear conversation' }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.helper-turn')).toHaveCount(0)
  await page.screenshot({ path: `test-results/${testInfo.project.name}-helper-welcome.png` })
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 360 })
  const panel = page.getByRole('dialog'), input = page.getByLabel('Ask a supported question'), send = page.getByRole('button', { name: 'Send question' })
  await expect(input).toBeVisible(); await expect(send).toBeVisible()
  for (const control of [panel,input,send,page.getByRole('button', { name: 'Close BizBridge Helper' })]) {
    const rect = await control.boundingBox(); expect(rect).not.toBeNull(); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x+rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width); expect(rect!.y+rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/${testInfo.project.name}-helper.png` })
  if (testInfo.project.name === 'mobile') { await page.getByRole('button', { name: 'Open navigation' }).click(); await expect(page.getByRole('link', { name: 'Products', exact: true })).toBeVisible() }
})
