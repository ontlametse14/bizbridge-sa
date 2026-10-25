# BizBridge SA

**Know your numbers. Grow your business.** Built by SeTshedi Innovations.

A working responsive business-records app for South African product businesses: profile → products → completed sales → operating expenses → dashboard → explained Growth Guide, with separate Money Split cash planning. React, TypeScript, Vite, Tailwind CSS, Lucide icons, Supabase Auth and PostgreSQL. No payment processing, funding decisions, FNB branding or official partnership.

## Open the local app on Windows

1. Install **Node.js 24 LTS** (or a supported LTS release satisfying the package engines) if Node is not already installed. Restart your terminal after installation. This build was checked on this machine's existing Node 25.8.0 and npm 11.11.0; prefer LTS for ongoing development.
2. Open PowerShell and run:

```powershell
cd C:\Users\setsh\Downloads\bizbridge-sa
npm.cmd ci
npm.cmd run dev -- --port 5173 --strictPort
```

3. Open **http://127.0.0.1:5173/**. If you moved the project, replace the `cd` path. `npm.cmd` avoids PowerShell execution-policy issues with `npm.ps1`. Leave the terminal open while using the app; Ctrl+C stops that server.
4. Click **Explore demo**. No Supabase account is needed to inspect the app. The welcome screen does not simulate login.

Dependencies are pinned in `package.json` and `package-lock.json`; use `npm ci` for reproducible installs. This folder was created within Downloads because no BizBridge repository existed there. Unrelated Downloads files were not modified.

## Demo versus real records

The separate demo says **“DEMO MODE — fictional data stored on this device.”** It uses localStorage under `bizbridge.demo.v1`, never Supabase. All sample values for **Demo Clean Supplies** are illustrative. Its initial completed sale (2 × R120, cost R70 each) and R30 transport expense produce 18 units remaining, R240 revenue, R140 COGS, R100 gross profit and R70 estimated operating profit. Other fictional products demonstrate a stock warning and an unknown product cost.

Use Settings → Preview controls to reset the sample or start an empty demo and try onboarding. Leaving the demo clears in-memory records and pending requests; the fictional saved workspace remains on the device for later previews. Demo writes use Web Locks to serialise same-origin tabs; a current browser on localhost or HTTPS is required. This is development convenience, **not evidence of Supabase security or database concurrency**.

Real accounts start empty. No seed runs on sign-up. If a configured backend fails, the app shows an error and retry action, and does not switch to demo. Demo is always an explicit choice.

## Supabase connection and setup

The dedicated free **bizbridge-sa-test** project is connected (`ekwwyxrjdqrigfggncff`). The core and both Money Split migrations are applied. Ignored `.env.local` contains its public URL and publishable key, and Vite has reloaded the configuration. The local Site URL is `http://127.0.0.1:5173`; allowed redirects are `/dashboard` on ports 5173 and 5174. Email confirmation remains enabled. Both dedicated accounts are confirmed. **13 live API/security/concurrency tests, 2 real-auth browser tests and 12 hosted public-boundary checks passed.** The two isolated test businesses remain for inspection. No web deployment or paid resource was created. See TESTING.md for full results and limits.

For a different fresh project, follow these steps. **Do not reapply the already recorded migrations to the connected test project.**

1. Create or select a Supabase project you control. For initial verification, use a separate disposable test project.
2. Apply all files in `supabase/migrations` in filename order through the Supabase integration or CLI. The core migration defines tables, constraints, ownership policies, restricted grants and RPC functions; the second adds reference indexes. The existing filenames match the remote migration versions recorded by the integration. `supabase/seed.sql` intentionally inserts nothing.
3. Enable email/password authentication. Keep email confirmations enabled for real accounts. Configure your project's email delivery as appropriate; development email sending is subject to the provider's limits.
4. Under Auth → URL Configuration, set the local Site URL to `http://127.0.0.1:5173` and add `http://127.0.0.1:5173/dashboard` to allowed redirect URLs. Use the same hostname consistently. For a future approved deployment, add its HTTPS URL and `/dashboard` redirect.
5. In PowerShell:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Replace both placeholders with your project's URL and **publishable** key. These two values are public browser configuration. Never paste a Supabase secret key, service-role key or database password into any `VITE_` variable. `.env.local` is gitignored. Do not share `.env.test` passwords either.

6. Stop and restart Vite after changing environment values. Open the welcome screen, create an account, follow the confirmation email, then sign in. The screen explains when confirmation is required. Create your business profile; this is **not company registration**.
7. Run the live tests below before trusting a hosted setup. SQL written on disk is not the same as SQL applied successfully to your project.

## How to use the workflow

- **Products:** add a product, an integer opening-stock quantity, selling price, optional unit cost and optional low-stock threshold. Blank cost means unknown; explicit R0 means a known zero cost. Editing prices affects future sales. Archive retains all history and can be reversed. Stock adjustments require a reason and leave a ledger entry.
- **Sales:** select one active product, quantity, date and payment-method label. A single PostgreSQL RPC saves immutable name/price/cost snapshots, reduces stock and adds a movement atomically. Failed or uncertain requests keep the same persisted retry key in the current tab; retry safely rather than creating another request. Completed sales are immutable in v1.
- **Expenses:** record operating costs such as transport, marketing, utilities or rent. **Inventory purchases are separate**: include inventory costs in unit cost and record received stock using Adjust stock. Entering those purchases here as well would deduct inventory costs twice. Packaging in this form means an operating cost not already included in your unit costs.
- **Dashboard:** select today, this month, last 30 days, this year or all time. Low-stock counts show current stock across all dates. Recent activity respects the selected period. Dates use Africa/Johannesburg; amounts use en-ZA ZAR formatting.
- **Growth Guide:** view each rules-based indicator, recommendation and its app action. Self-assessed habits save to the business profile. There is no revenue reward or generative-AI dependency. Optional location has no score impact. Empty businesses have no overall score.

## Money Split

Open **Money Split** in the existing navigation. It is a private money-planning page, not a bank account, payment service, tax tool or AI assistant. No new keys, bank connections, subscriptions or AI services are required.

**The snapshot rule:** enter the total business cash you actually have now, including amounts you intend to earmark. Count each amount once when combining cash/bank totals; exclude available credit, expected customer payments, stock value and profit. Each confirmation **replaces** the current snapshot. Sales and expenses never automatically change this manually confirmed amount. The page always shows its confirmation time in Africa/Johannesburg and labels it **Owner-entered balance — not bank-verified.** Unrecorded activity can make it out of date.

- **Plan my money:** create or edit outstanding allocations for stock, bills, transport, a buffer or another need. This changes planning amounts only. Cancelling releases an allocation without increasing cash or creating income. Cancelled and settled entries remain in change history.
- **Check a personal withdrawal:** confirm you have just checked that actual cash still matches the snapshot, then preview the proposed amount. If cash has changed, use Update cash balance first. The preview shows unallocated before/after, including the full negative balance and shortfall. It saves nothing and never reduces allocations to hide a warning. Unallocated does not mean safe to spend.
- **Record a completed withdrawal:** enter the amount, date, optional note and **actual current cash after the withdrawal**, and confirm that the balance already reflects it. The history entry and replacement snapshot save together. Nothing is deducted a second time, and profit is unchanged.
- **Paid / settled:** confirm actual cash after the payment. The allocation stops counting and the new snapshot saves atomically. No extra deduction or expense is created. Record genuine operating expenses separately in Expenses; keep inventory purchases out of operating expenses as before.
- **Correct a withdrawal:** choose Add correction on its latest entry, enter corrected information, a reason and actual current cash. The original remains visible as superseded. A correction of R0 means the original withdrawal did not happen. Corrections are historical annotations plus a new cash confirmation, not refunds or transfers.

Amounts use integer cents and the existing en-ZA rand formatter. Each amount is capped at R1,000,000 in this prototype. Cash may be zero; new allocations and completed withdrawals must be positive. Only active allocations count. No balance is inferred from a failed or missing request.

Every mutation has a persisted retry key and expected plan revision. Two tabs cannot silently overwrite each other: a stale plan gets an HTTP 409 conflict and must be reviewed again. An uncertain save keeps its original request in scoped sessionStorage and offers **Retry submitted change**, including after refresh. Real plan records live in memory while open and in Supabase; demo plans use a separate device-only key per fictional business. Logout clears pending requests and private screens. Account/business/mode changes discard the mounted plan and reject late reads.

### Demonstrate with fictional data

Choose Explore demo, open Money Split, and enter:

1. Update cash balance: **R1,200**.
2. Plan my money: **Stock R700**, **Bills R200**, **Buffer R100**. The page shows R1,000 allocated and **R200 unallocated**.
3. Check a personal withdrawal: **R400**. The preview shows **R200 shortfall afterward**, without saving a withdrawal.
4. Record a completed withdrawal: **R150**, actual cash afterward **R1,050**. The result is **R50 unallocated**, not a second R150 deduction.
5. For the separate settlement scenario, use a fresh fictional demo (Settings → reset sample), repeat steps 1–2, then settle Bills and confirm **R1,000** actual cash. The result is **R800 allocated and R200 unallocated**.

The demo is never seeded into real accounts. A reset creates a fresh demo business ID; earlier fictional Money Split histories stay in their separate device storage rather than being attached to the new business.

### Money Split database setup and tests

Both additions are already applied **only to the dedicated `bizbridge-sa-test` project**:

- `supabase/migrations/20261025145211_money_split.sql`
- `supabase/migrations/20261025150354_money_split_conflict_response.sql`

Do not reapply them to that project. The second migration is required: it replaces SQLSTATE 40001 with a PostgREST HTTP 409 conflict response. Apply all migrations in filename order to a separately approved new environment. No production database or web deployment was changed.

`npm.cmd run test:sql` includes isolated Money Split PostgreSQL checks. `npm.cmd run test:e2e -- tests/browser/money.spec.ts` runs its demo/synthetic browser checks. `npm.cmd run test:money:api` is a guarded hosted test that writes fictional planning fixtures only: it requires the selected test project, the two named isolated fixture businesses, explicit local fixture opt-in and empty Money Split plans for both accounts. The existing test plans are now populated, so the runner intentionally refuses a fresh rerun. Do not reset histories to make a test pass. A tightly guarded continuation flag exists only for the exact interrupted initial fixture state, documented in TESTING.md; it will not match the completed plans.

Limits: this is a manually maintained plan, not a live cash reconciliation system. Confirmations are current snapshots even when a withdrawal date is historical. There are no recurring allocations, shared wallets, bank imports, payment processing or tax/salary calculations. Histories currently load in full and should be paginated before large-scale use.

## BizBridge Helper

Choose **Help** on the welcome screen or in the app's top bar. **BizBridge Helper — Guided help for your business.** offers prepared instructions for products, sales and operating expenses, your business summary, low-stock products, Growth Guide factors and a gross-profit explanation. Choose a suggested question or type a supported phrase such as `add item`, `record sale`, `business summary` or `restock`. Ambiguous questions offer choices; unsupported questions list the supported topics.

This is a **rules-based helper, not a generative-AI chatbot**. It needs no AI provider, API key, subscription, model download or AI-provider fees. It reuses the workspace already loaded by the app; it makes no additional backend requests and sends neither questions nor business records to chat services or analytics. Existing Supabase usage remains governed by your project's plan.

Business answers require the current signed-in workspace, or an explicitly selected fictional demo. Summary amounts and incomplete-cost warnings use the same functions as Dashboard. The Dashboard reporting-period selection also controls the helper and stays selected while navigating within the current session. Answers show that period and the workspace's retrieval time in Africa/Johannesburg. After saving a sale or expense through the normal form, existing answers update from the refreshed workspace. Failed or unavailable records show an explanation, never invented zero balances. Demo answers carry the fictional-data label.

The helper cannot add, edit or delete records. Its action buttons only open existing app screens. Conversation history (up to 20 questions) stays in memory and clears on logout, account/business change, real/demo switch or page reload. **Clear conversation** also clears the draft. Close with the close button or Escape; focus returns to Help. Tab/Shift+Tab navigate controls, and Enter sends a question. The compact desktop panel becomes a mobile sheet; the header navigation remains accessible and the composer follows the visible viewport.

### Add or revise a prepared answer

1. Edit `src/helper-guidance.ts`. Keep prepared text in `guidance`, question labels in `topics`, and synonyms in the small `intents` map. Match specific phrases before broad keywords and return choices for multiple matches. Do not promise understanding beyond these topics.
2. Base instructions on the actual forms. Use existing routes only; navigation must never submit a form. Keep inventory purchases separate from operating expenses and label illustrative figures.
3. For business answers, reuse `businessReport`, `incompleteProfitMessage`, `lowStock` and `readiness` from `src/domain.ts`. Preserve authentication, error, missing-cost and demo guards. Do not import mutation adapters or add network/storage calls to the helper.
4. Add examples and edge cases to `src/helper.test.ts`; extend `tests/browser/helper.spec.ts` for UI/privacy changes. Run the verification commands below. Run just the helper browser checks with `npm.cmd run test:e2e -- tests/browser/helper.spec.ts`.

`src/BizBridgeHelper.tsx` handles the panel and memory-only conversation. The development-only `tests/helper-harness.html` exercises synthetic account/business transitions and intercepted delayed requests; it is not a production entry or proof of hosted database security.

## Calculation rules

All stored amounts are integer cents; input strings are validated and parsed without floating-point multiplication of a decimal amount. PostgreSQL uses bigint cents and constrained whole-number quantities. Aggregate sums use BigInt with a safe-range check before display.

```text
Revenue = sum(sale total cents)
COGS = sum(quantity × recorded unit-cost snapshot)
Gross profit = revenue − COGS
Estimated operating profit = gross profit − recorded operating expenses
```

If an included sale has a NULL cost snapshot, COGS, gross profit and operating profit are marked **Incomplete**. The UI identifies the affected products and known partial COGS; it never substitutes zero. Updating a product does not backfill or rewrite past sales. Estimates exclude tax and unrecorded costs. This prototype is not a complete accounting or tax system.

## Verification commands

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:sql
npm.cmd run test:e2e
npm.cmd run build
```

Playwright uses installed Microsoft Edge at the standard Windows path when available. Otherwise install its Chromium browser with `npx.cmd playwright install chromium`. Demo and helper-fixture browser tests start a local server automatically or reuse port 5173. Reports are in `playwright-report`; screenshots are in `test-results`. Both are ignored. Real authentication uses the separate `test:auth` command below with traces, screenshots and video disabled. `test:sql` runs the real migration on embedded PostgreSQL (PGlite) with mocked auth identity; it does not test Auth, PostgREST or concurrent database connections.

### Live two-account Supabase tests

1. Apply the migration to a **disposable Supabase project**.
2. Create two different, confirmed email/password users with no businesses. Do not use customer accounts. You can confirm dedicated test users through the project's Auth dashboard.
3. Copy `.env.test.example` to `.env.test`. Fill in the test URL/publishable key and the two test account credentials. Set `TEST_ALLOW_DISPOSABLE_BUSINESSES=true`.
4. Run `npm.cmd run check:supabase` to check local configuration, then `npm.cmd run test:database`. The database runner refuses to proceed if either account already has a business. It populates both accounts, tests atomicity, six simultaneous requests sharing a new retry key, twelve independent requests competing for five units, historical snapshots, two-way cross-account attacks, anonymous access and session logout. Permission checks require the actual database denial code; connectivity failures do not count as security passes. It prints case names, never credentials.
5. Run `npm.cmd run test:auth` for real login, refresh persistence, helper authentication/privacy and private-route logout checks. It reads existing fixture records without creating or changing business records. It starts a fresh local app on port **5174**, explicitly pointing to the same `.env.test` project. This avoids accidentally reusing a demo or differently configured server on port 5173. Only public configuration is exposed to the frontend. Authentication traces/screenshots/video are disabled. Missing credentials stop the live runner non-successfully instead of reporting skipped tests as a successful run. `test:e2e` runs the separate device-demo and helper-fixture suites. To test signup email links at this test origin, add `http://127.0.0.1:5174/dashboard` to Supabase Auth's allowed redirects as well.
6. The two isolated fixture businesses remain after the run so you can inspect them. The runner deliberately refuses a repeat against accounts that already have businesses. For another full run, use fresh confirmed test accounts, or deliberately remove the disposable app users through this test project's Auth dashboard first; cascading foreign keys remove their fixtures. Do not delete a login you want to keep. This concerns BizBridge app users, not your Supabase dashboard account. Tests do not request a service-role key or bypass the app's permissions to clean up.

`npm.cmd run check:supabase:public` can run before the two accounts are ready: it checks anonymous denial on all five private tables and six RPCs, plus enabled email authentication with confirmation required. It does not prove signed-in isolation or concurrency.

When explicitly creating a test account whose inbox you control, `npm.cmd run test:signup -- A` (or `B`) uses that account's local `.env.test` values and the normal Supabase signup API. It keeps confirmation enabled and prints no credentials or Auth response body. Confirm the email before running tests. Do not run signup repeatedly or on an unrelated project; provider email restrictions and rate limits apply. Dashboard-created, individually auto-confirmed disposable users remain an alternative for test fixtures.

Signup/email-confirmation delivery requires an email address you control and a real confirmation-link check. The automated live suite uses two already-confirmed test users; its success alone must not be reported as email-delivery verification. Keep passwords and confirmation links out of chat. The Supabase integration is connected; no database password needs to be pasted here.

See **TESTING.md** for actual results and unrun checks, and **ARCHITECTURE.md** for security decisions and limits.

## Vercel preparation — no deployment performed

`npm run build` outputs `dist`. `vercel.json` defines Vite settings, SPA routing and security headers. After you approve deployment, configure Vercel with build command `npm run build`, output directory `dist`, Node 24 LTS and the two public Supabase variables. Add the approved HTTPS origin to Supabase Auth redirect settings. The CSP currently allows the standard `*.supabase.co` domain; adjust `connect-src` for a custom Supabase domain. Do not deploy before applying the migration and completing live security tests.

## Deliberate first-version limits

One owner and one business; no team sharing, payment processing, native app, offline sync or generative-AI chatbot. BizBridge Helper supports only its documented prepared topics. No returns, refunds, sale voids, historical cost repair, inventory-purchase ledger, CSV exports, VAT/tax filings or formal accounting reports. Existing sales and expenses cannot be edited or deleted from the UI. No password-reset flow in this first version; administrators can send recovery assistance through Supabase while a full recovery screen is developed. Workspace data currently loads in a single consistent JSON snapshot; add server-side reporting/pagination before handling large histories. See architecture notes for data-correction and operational work before wider rollout.
