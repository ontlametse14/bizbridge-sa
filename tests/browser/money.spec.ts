import { expect, test, type Page } from '@playwright/test'
import { sampleWorkspace } from '../../src/demo'
import { applyMoneyRequest, emptyMoneyPlan, type MoneyRequest } from '../../src/money-plan'
async function start(page: Page) { await page.goto('/'); await page.getByRole('button', { name: 'Explore demo', exact: true }).click(); await page.goto('/money'); await expect(page.getByText('Cash balance not confirmed yet', { exact: true })).toBeVisible() }
async function confirmCash(page: Page, amount: string) {
  await page.getByRole('button', { name: 'Update cash balance', exact: true }).click()
  await page.getByLabel('Current business cash (R)', { exact: true }).fill(amount)
  await page.getByRole('button', { name: 'Confirm current cash' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function allocate(page: Page, name: string, amount: string, category: string) {
  await page.getByRole('button', { name: 'Plan my money', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill(name); await page.getByLabel('Category', { exact: true }).selectOption(category)
  await page.getByLabel('Amount still earmarked (R)', { exact: true }).fill(amount)
  await page.getByRole('button', { name: 'Save allocation' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function fixture(page: Page) { await start(page); await confirmCash(page,'1200'); await allocate(page,'Stock','700','Replacement stock'); await allocate(page,'Bills','200','Upcoming bills'); await allocate(page,'Buffer','100','Emergency buffer') }
async function stored(page: Page) { return page.evaluate(() => { const w=JSON.parse(localStorage.getItem('bizbridge.demo.v1')!); return { workspace:w, plan:JSON.parse(localStorage.getItem(`bizbridge.demo.money.v1.${w.business.id}`) ?? 'null') } }) }
const actualCash = (page: Page) => page.getByLabel('Actual current cash AFTER payment or withdrawal (R)', { exact:true })

test('A/B/C: cash planning, read-only preview, duplicate prevention and refresh', async ({ page }) => {
  await fixture(page)
  await expect(page.getByTestId('money-cash')).toContainText('1 200'); await expect(page.getByTestId('money-allocated')).toContainText('1 000'); await expect(page.getByTestId('money-unallocated')).toContainText('200')
  const before=await stored(page)
  await page.getByRole('button',{name:'Check a personal withdrawal',exact:true}).click()
  await page.getByLabel('Proposed personal withdrawal (R)',{exact:true}).fill('400'); await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:'Preview withdrawal',exact:true}).click(); await expect(page.locator('.money-preview')).toContainText('R 200,00 shortfall')
  expect(await stored(page)).toEqual(before)
  await page.getByRole('button',{name:'Close dialog'}).click()
  await page.getByRole('button',{name:'Record a completed withdrawal',exact:true}).click(); await page.getByLabel('Withdrawal amount (R)',{exact:true}).fill('150'); await actualCash(page).fill('1050'); await page.getByRole('checkbox').check()
  await page.locator('dialog form').evaluate(form=>{(form as HTMLFormElement).requestSubmit();(form as HTMLFormElement).requestSubmit()})
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByTestId('money-unallocated')).toContainText('50')
  let after=await stored(page); expect(after.plan.withdrawals).toHaveLength(1); expect(after.plan.snapshots).toHaveLength(2); expect(after.workspace).toEqual(before.workspace)
  await page.reload(); await expect(page.getByTestId('money-unallocated')).toContainText('50')
  await confirmCash(page,'1050'); after=await stored(page); expect(after.plan.withdrawals).toHaveLength(1); expect(after.plan.snapshots).toHaveLength(3)
})

test('D: settlement, edits and cancellation only change the money plan', async ({ page }) => {
  await fixture(page); const before=await stored(page)
  await page.getByRole('button',{name:'Settle Bills',exact:true}).click(); await actualCash(page).fill('1000'); await page.getByRole('checkbox').check(); await page.getByRole('button',{name:'Settle and confirm cash'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('money-allocated')).toContainText('800'); await expect(page.getByTestId('money-unallocated')).toContainText('200')
  await page.getByRole('button',{name:'Edit Stock',exact:true}).click(); await page.getByLabel('Amount still earmarked (R)',{exact:true}).fill('600'); await page.getByRole('button',{name:'Save allocation'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'Cancel Stock',exact:true}).click(); await page.getByRole('button',{name:'Release allocation'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  const after=await stored(page); expect(after.workspace).toEqual(before.workspace); expect(after.plan.snapshots).toHaveLength(2); expect(after.plan.allocations.filter((x:{status:string})=>x.status==='active')).toHaveLength(1)
})

test('empty cash, invalid input, negative balances and append-only corrections', async ({ page }) => {
  await start(page); await expect(page.getByTestId('money-cash')).toHaveText('Not confirmed')
  await page.getByRole('button',{name:'Check a personal withdrawal',exact:true}).click(); await expect(page.getByText('Confirm your cash first')).toBeVisible(); await page.getByRole('button',{name:'Close dialog'}).click()
  await page.getByRole('button',{name:'Update cash balance',exact:true}).click(); await page.getByRole('button',{name:'Confirm current cash'}).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByLabel('Current business cash (R)',{exact:true}).fill('-1'); await page.getByRole('button',{name:'Confirm current cash'}).click(); await expect(page.getByRole('alert')).toContainText('valid rand amount'); await page.getByRole('button',{name:'Close dialog'}).click()
  await confirmCash(page,'100'); await allocate(page,'Stock','300','Replacement stock'); await expect(page.getByTestId('money-unallocated')).toContainText('-R'); await expect(page.getByText(/Your plan has a .*shortfall/)).toBeVisible()
  await page.getByRole('button',{name:'Record a completed withdrawal',exact:true}).click(); await page.getByLabel('Withdrawal amount (R)',{exact:true}).fill('50'); await actualCash(page).fill('50'); await page.getByRole('checkbox').check(); await page.getByRole('button',{name:'Save withdrawal and cash'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'Add correction',exact:true}).click(); await page.getByLabel('Withdrawal amount (R)',{exact:true}).fill('40'); await actualCash(page).fill('60'); await page.getByLabel('Correction reason',{exact:true}).fill('Entered amount incorrectly'); await page.getByRole('checkbox').check(); await page.getByRole('button',{name:'Save correction and cash'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Superseded by correction',{exact:true})).toBeVisible(); const p=(await stored(page)).plan; expect(p.withdrawals).toHaveLength(2); expect(p.snapshots[0].cash_cents).toBe(6000)
})

test('failed data is unavailable, not a zero balance; retry restores the plan', async ({ page }) => {
  const w=sampleWorkspace()
  await page.route('https://*.supabase.co/**',route=>route.abort())
  await page.route('**/rpc/get_workspace',route=>route.fulfill({json:w}))
  let fail=true
  await page.route('**/rpc/get_money_plan',route=>fail?route.fulfill({status:503,json:{message:'Fictional unavailable service'}}):route.fulfill({json:emptyMoneyPlan(w.business!.id)}))
  await page.goto('/tests/money-harness.html'); await expect(page.getByRole('alert')).toContainText('Unable to load Money Split'); await expect(page.getByTestId('money-cash')).toHaveCount(0)
  fail=false; await page.getByRole('button',{name:'Reload plan'}).click(); await expect(page.getByTestId('money-cash')).toHaveText('Not confirmed')
})

test('a late response cannot cross account boundaries or survive logout', async ({ page }) => {
  const a=sampleWorkspace(),b=sampleWorkspace();a.business!.name='PRIVATE A';b.business!.name='PRIVATE B'
  let account='a',release!:()=>void,started!:()=>void
  const pending=new Promise<void>(resolve=>{release=resolve}),begun=new Promise<void>(resolve=>{started=resolve})
  await page.route('https://*.supabase.co/**',route=>route.abort())
  await page.route('**/rpc/get_workspace',route=>route.fulfill({json:account==='a'?a:b}))
  await page.route('**/rpc/get_money_plan',async route=>{const id=route.request().postDataJSON().p_business_id;const p=emptyMoneyPlan(id);if(id===a.business!.id){started();await pending;p.snapshots=[{id:'fixture',business_id:id,revision:1,cash_cents:9876543,confirmed_at:new Date().toISOString(),source:'confirm',note:'PRIVATE A'}]}await route.fulfill({json:p})})
  await page.goto('/tests/money-harness.html'); await begun; await expect(page.getByText('Loading your private money plan…')).toBeVisible()
  account='b'; await page.getByLabel('Test account').selectOption('b'); await expect(page.getByTestId('money-cash')).toHaveText('Not confirmed')
  const late=page.waitForResponse('**/rpc/get_money_plan');release();await(await late).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await expect(page.getByTestId('money-cash')).toHaveText('Not confirmed');await expect(page.locator('body')).not.toContainText('PRIVATE A')
  await page.getByLabel('Test account').selectOption('logged-out');await expect(page.getByTestId('money-cash')).toHaveCount(0)
})

test('a lost save response can be retried after refresh without duplicate history', async ({ page }) => {
  const workspace=sampleWorkspace();let plan=emptyMoneyPlan(workspace.business!.id),calls=0
  const received: MoneyRequest[]=[]
  await page.route('https://*.supabase.co/**',route=>route.abort())
  await page.route('**/rpc/get_workspace',route=>route.fulfill({json:workspace}))
  await page.route('**/rpc/get_money_plan',route=>route.fulfill({json:plan}))
  await page.route('**/rpc/change_money_plan',async route=>{
    const body=route.request().postDataJSON(),request={kind:body.p_kind,input:body.p_payload,key:body.p_request_id,expectedRevision:body.p_expected_revision} as MoneyRequest
    received.push(request);plan=applyMoneyRequest(plan,request)
    if(++calls===1)await route.abort('failed');else await route.fulfill({json:plan.revision})
  })
  await page.goto('/tests/money-harness.html');await expect(page.getByTestId('money-cash')).toHaveText('Not confirmed')
  await page.getByRole('button',{name:'Update cash balance',exact:true}).click();await page.getByLabel('Current business cash (R)',{exact:true}).fill('1200');await page.getByRole('button',{name:'Confirm current cash'}).click()
  await expect(page.getByRole('button',{name:'Retry submitted change'})).toBeVisible()
  await page.reload();await expect(page.getByRole('button',{name:'Retry submitted change'})).toBeVisible();await expect(page.getByTestId('money-cash')).toContainText('1 200')
  await page.getByRole('button',{name:'Retry submitted change'}).click();await expect(page.getByRole('button',{name:'Retry submitted change'})).toHaveCount(0)
  expect(received).toHaveLength(2);expect(received[0]).toEqual(received[1]);expect(plan.events).toHaveLength(1);expect(plan.snapshots).toHaveLength(1)
})

test('mobile layout, navigation and native dialog keyboard operation', async ({ page },testInfo) => {
  await fixture(page)
  if(testInfo.project.name==='mobile')await page.setViewportSize({width:320,height:740})
  const trigger=page.getByRole('button',{name:'Update cash balance',exact:true});await trigger.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Current business cash (R)',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Note (optional)',{exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(trigger).toBeFocused()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/${testInfo.project.name}-money.png`,fullPage:true})
  if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'Open navigation'}).click()
  await expect(page.getByRole('link',{name:'Money Split',exact:true})).toBeVisible()
  if(testInfo.project.name==='mobile'){
    const backdrop=page.getByRole('button',{name:'Close navigation'})
    const bounds=await backdrop.boundingBox();expect(bounds).not.toBeNull()
    // The drawer covers the backdrop's centre on narrow screens. Tap its exposed edge.
    await backdrop.click({position:{x:bounds!.width-8,y:80}});await expect(backdrop).toHaveCount(0)
    await page.getByRole('button',{name:'Open navigation'}).click()
    await backdrop.focus();await page.keyboard.press('Enter');await expect(backdrop).toHaveCount(0)
  }
  await page.getByRole('button',{name:'Help',exact:true}).click();await expect(page.getByRole('dialog',{name:'BizBridge Helper'})).toBeVisible()
})
