# Actual verification results

## GitHub publication checks — 25 October 2026

The completed project was reviewed in `C:\Users\setsh\Downloads\bizbridge-sa`, including BizBridge Helper, Money Split and all four migrations. This folder had no Git repository or prior commit history and no attached alternate worktree. A new local repository uses `main`. The authenticated personal account is `ontlametse14`; its `bizbridge-sa` repository did not exist, so the authorised destination was created as **private**. No application refactoring, deployment or database migration was performed for publication.

| Check rerun for publication | Actual result |
| --- | --- |
| Type checking and ESLint | Passed, including a second run after the browser-test adjustment |
| Vitest | 102 passed; the first sandbox attempt could not start tests due to temporary-file EPERM errors, then the normal-permission retry passed |
| Embedded SQL | 48 passed (28 core + 20 Money Split); isolated embedded databases only |
| Demo/mocked browser suite | Final full run: **38 passed** in 2.5 minutes |
| Real authentication browser suite | **2 passed** in 47.7 seconds; existing test records were read, with no business-data writes |
| Production build | Passed; the existing non-blocking 589 kB / 170 kB gzip main-chunk warning remains |
| Source/secret review | 57 intended source/configuration/test/asset files reviewed; no private credentials found |
| Deployment checks | New destination has zero Actions workflows, zero repository webhooks and zero deployments; local source has no automatic deployment workflow or Vercel project link |

The initial browser run passed 37 cases and timed out on the 320 px mobile backdrop click. An isolated retry reproduced it: the test clicked the backdrop's centre, which was covered by the navigation drawer. The test now clicks the exposed edge and separately verifies keyboard activation of the close control. All 38 cases then passed in one full run. Application behavior was not changed to resolve this test issue.

The secret review compared candidate files against credential values in ignored local environment files without printing them, scanned common token/private-key/database-credential patterns, and reviewed the two synthetic fixture-token findings. Only deliberately invalid fixture strings were found. Local environment files remain untouched. `.gitignore` additionally excludes common private-key, saved-session and database-export files. Dependencies, build output, test artifacts, local CLI/audit helpers and logs are excluded. Environment examples contain only placeholders or blank test values. There was no pre-existing history to sanitise. The staged snapshot and resulting commit are checked again before push.

Hosted mutation/concurrency suites were deliberately **not rerun** for publishing: their isolated fixtures are already populated and the runners refuse reuse. Their earlier results remain documented below. No live business records were modified. General GitHub App-installation enumeration returned HTTP 403 with the CLI OAuth credential; the repository-specific workflow, webhook and deployment checks above succeeded. No Vercel deployment was requested or performed.

## Money Split — 25 October 2026

The working page is available at `/money` through the existing desktop/mobile navigation. Real records use the connected private Supabase backend; the separate demo starts with an unconfirmed cash balance and stores fictional planning data only on the device. No deployment, paid resource, bank/AI integration or production database change occurred.

| Check actually run | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed, no type errors |
| `npm.cmd run lint` | Passed, no errors or warnings |
| `npm.cmd test` | **102 passed** in 3 files: 74 existing tests and 28 Money Split tests |
| `npm.cmd run test:sql` | **48 passed**: 28 existing and 20 Money Split embedded PostgreSQL checks; all four migrations apply |
| `npm.cmd run test:e2e` | **38 passed** in 2.9 minutes: 24 existing app/helper and 14 Money Split desktop/mobile cases |
| `npm.cmd run test:money:api` plus guarded continuation | **19 distinct hosted checks passed**, in two stages: 7 before the conflict-response bug, 12 after its migration fix. This was not one uninterrupted green run. |
| `npm.cmd run test:auth` | **2 passed** in 32 seconds, real Supabase desktop/mobile login, Money Split refresh persistence, helper privacy and logout/private-route protection; no business writes |
| `npm.cmd run build` | Passed; Vite's non-blocking main-chunk warning remains (about 589 kB minified / 170 kB gzip). Development harnesses are not production entries. |
| Hosted catalogue/advisor checks | All 5 new tables have RLS; anonymous EXECUTE is denied on both RPCs; both fix an empty search_path; the reader is invoker and mutation is explicitly ownership-checked definer. The follow-up PT409 clause is present. No affected test requests remain active. |

**Acceptance results:** Test A gives cash R1,200 / allocations R1,000 / unallocated R200. Test B's R400 preview gives a R200 shortfall and no storage/database change. Test C saves one R150 withdrawal with replacement cash R1,050, leaving R50 unallocated. Test D runs separately from the initial plan: settling the R200 bill with actual cash R1,000 leaves allocations R800 and unallocated R200. No second deduction or expense occurs.

**Additional coverage:** reconfirming unchanged cash preserves withdrawal/allocation history; cancellation creates no income; overallocations retain negative values; edits retain prior allocation values; corrections append linked entries and leave originals intact; empty/unconfirmed differs from zero; invalid/null/fractional/oversized values and missing explicit confirmation are rejected; failed reads expose no money figures; duplicate submissions use one persisted request; lost responses retry after refresh without duplicate events; late account responses are ignored; and original sales/expenses/stock/profit inputs remain unchanged.

**Hosted boundary/concurrency evidence:** six simultaneous retries of one new key produced one event, one cash snapshot and one withdrawal. Six independent changes with the same expected revision produced one accepted update and five PT409 conflicts, with one new snapshot/event. Both fixture accounts have populated Money Split tables before two-way attacks. Tests require exact database denial codes for cross-account reads, create/update/delete attempts, reassigned business IDs, foreign allocation IDs and correction targets. Anonymous table/RPC access is denied. A fresh authenticated client sees persisted records, and a signed-out client cannot read the plan.

**Failures found and repaired:** isolated SQL caught an allocation-edit variable qualification error before the migration was applied. Browser tests caught missing focus return after closing native dialogs; the shared Modal now restores the original trigger and all existing browser regressions pass. Hosted concurrency exposed a real PostgREST 14.18 retry loop because an application conflict used SQLSTATE 40001. The database accepted only one competing change, but the other API requests timed out. Logs and [Supabase's documented issue](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions) identified the cause. A separate migration changes that response to PT409/HTTP 409. Only identified affected Money Split test connections were terminated; no database reset occurred. A final catalogue query confirmed zero active affected requests.

The first hosted run passed 7 cases before that failure. A guarded continuation required the exact dedicated project, named fixture businesses, A revision 8/B revision 6 and the expected event sequence; it reran the concurrency case and completed the remaining 12 checks. Existing histories were retained. The normal test runner still refuses nonempty plans, and the recovery flag no longer matches these completed fixtures. The existing sale/concurrency fixture runner (`test:database`) was not rerun, because it would require fresh original-business fixtures; its earlier results below are historical.

One diagnostic attempt was rejected by automatic approval review because it lacked explicit disposable-project/fixture guards. A replacement diagnostic added those guards, required an already-established revision, deliberately submitted a stale revision and verified that the plan was unchanged. No blocked approval remains.

**Database state:** the dedicated `bizbridge-sa-test` project has both new migrations, with local filenames matching remote history: `20261025145211_money_split.sql` and `20261025150354_money_split_conflict_response.sql`. Existing migrations and transaction records were preserved. Test-only Money Split fixtures remain for inspection. No external setup remains for the connected local app. A future production environment needs approval and all migrations in order, including the conflict-response fix.

**Visual review and limits:** desktop 1440 px and Chromium mobile emulation at 390 px/320 px. Native dialog labels, Tab traversal, Escape, trigger focus return, navigation and horizontal overflow passed. Desktop/mobile screenshots were reviewed. Physical mobile keyboards, Safari/iOS, screen readers and a formal accessibility audit were not tested. High-volume history performance, disaster recovery and deployed-origin security headers remain outside this local feature verification. Advisors retain the intentional authenticated-definer warning and report the existing leaked-password-protection setting; details and remediation links are in ARCHITECTURE.md. No Money Split missing-RLS or missing-FK-index finding was reported.

**Files added:** `src/MoneySplit.tsx`, `src/money-plan.ts`, `src/money-store.ts`, `src/money-plan.test.ts`, both SQL migrations above, `tests/money-sql.mjs`, `tests/money-api.mjs`, `tests/money-harness.html`, `tests/money-harness.tsx`, `tests/browser/money.spec.ts`.

**Files updated:** `src/App.tsx`, `src/domain.ts`, `src/demo.ts`, `src/components.tsx`, `src/styles.css`, `tests/browser/real-auth.spec.ts`, `playwright.config.ts`, `package.json`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `TESTING.md`. No new dependency or frontend credential was added. The original sales/expense forms, backend adapter and profit formula are unchanged.

## BizBridge Helper — 25 October 2026

Implemented on the existing application without new dependencies, schema/policy changes, deployment or changes to live business records. The configured Supabase connection remains in use for real accounts; the explicitly selected demo remains fictional and device-only.

| Check run for this feature | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | Passed, no type errors |
| `npm.cmd run lint` | Passed, no errors or warnings |
| `npm.cmd test` | **74 passed** in 2 files: 36 existing domain tests and 38 helper tests |
| `npm.cmd run test:sql` | **28 passed** against embedded PostgreSQL, using the unchanged migrations; no hosted writes |
| `npm.cmd run test:e2e` | **24 passed**: 10 existing demo cases and 14 helper cases, desktop/mobile |
| `npm.cmd run test:e2e -- tests/browser/helper.spec.ts` | **14 passed** again after strengthening update/late-response assertions and keyboard behavior |
| Focused privacy rerun (`--grep "private conversation clears"`) | **2 passed**, explicitly testing a business-only change before account/mode/logout changes |
| `npm.cmd run test:auth` | **2 passed**, real Supabase desktop/mobile sign-in, refresh persistence, authorised helper summary and immediate logout clearing before reload; read-only business access |
| `npm.cmd run build` | Passed. Main chunk 562.85 kB minified / 163.09 kB gzip; Vite's non-blocking 500 kB chunk warning remains. No test harness is included in `dist`. |

**Helper coverage:** all seven prepared topics and synonyms; specific-before-general matching; ambiguous and unsupported questions; read-only responses to mutation requests; existing-page navigation; plain-text user input; Dashboard-equivalent reporting values, periods and missing-cost warnings; true empty, loading and failed data; low-stock and readiness results; updated answers after sales/expenses saved through demo forms; real/demo labels and anonymous guards; clearing on account, business, mode and logout changes; and rejection of a delayed response from an old workspace. Network traffic for the delayed-account test is intercepted and uses synthetic fixtures, not live records.

An interaction test asks all supported topics and mutation/ambiguous questions while recording browser requests and comparing local/session storage. It observes **zero network requests and no storage changes** from helper interactions. The helper has no network or mutation adapter calls. Conversation and draft state remain in memory. The production build contains only the normal app entry and assets.

**Visual/keyboard review:** Edge/Chromium desktop and mobile emulation, including 320 px width and a 320×360 shortened viewport. Enter opens/sends, Tab and Shift+Tab follow the input/send controls, Escape returns focus to Help, and clearing returns focus to the text box. Header navigation, close and composer stay inside the viewport without horizontal scrolling. Desktop, normal mobile and shortened-mobile screenshots were inspected. The shortened viewport exercises the resize behavior; it is not proof of a physical mobile keyboard implementation.

**Real authentication:** the separate 5174 test server used the existing confirmed fixture account and hosted records. It verified the helper identifies authorised real records, clears its conversation immediately on logout, refuses private answers after logout and retains the app's route/cache protection after navigation. No business record was created, edited or deleted. Authentication traces, screenshots and video were disabled. These two cases passed again after adding the immediate-before-reload assertion.

**Not run for this change:** the hosted `test:database` fixture/mutation/concurrency suite was deliberately not rerun because this task prohibits modifying live business records. Its 13 passing checks below are historical evidence from the previous connection task, not new results. Native iOS/Safari/Android keyboard behavior, screen-reader testing and a formal accessibility audit remain unverified. No deployment or production-origin checks ran. No external setup or AI-provider key is needed to use the helper locally.

**Files changed:** `src/BizBridgeHelper.tsx`, `src/helper-guidance.ts`, `src/helper.test.ts`, `src/App.tsx`, `src/domain.ts`, `src/store.tsx`, `src/pages.tsx`, `src/styles.css`, `tests/browser/helper.spec.ts`, `tests/browser/real-auth.spec.ts`, `tests/helper-harness.html`, `tests/helper-harness.tsx`, `playwright.config.ts`, `tsconfig.json`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md` and this file. Existing backend adapters, migrations, access policies, form mutations and package dependencies are unchanged.

## Previous connection verification — 24 October 2026

The sections below retain results from the original Supabase connection task. The feature-specific table above supersedes their local test counts.

## Supabase connection follow-up

The live suite has been strengthened since the initial results below. It now populates transactions for both accounts, checks isolation in both directions, requires actual database permission-denial codes, sends six simultaneous requests with the same new key and twelve independent requests for five units, and checks stock-movement counts. A separate `npm.cmd run test:auth` configuration starts a fresh server on port 5174 and disables authentication traces, screenshots and video. `test:e2e` now selects only the ten demo-browser cases.

The Supabase integration is connected. A free, separate `bizbridge-sa-test` project (`ekwwyxrjdqrigfggncff`, eu-west-1) was created in the user's chosen organisation. The unrelated BUSANG STUDIO project was not modified. The core migration was recorded remotely as `20261024210141_bizbridge_core` and reference indexes as `20261024210433_bizbridge_reference_indexes`. Local filenames match these remote versions; do not apply them again. Both hosted migration calls succeeded. All five tables have RLS enabled. `.env.local` contains only public frontend configuration; `.env.test` contains the two dedicated test credentials. Both are ignored. The local Site URL and the 5173/5174 dashboard redirects were saved and verified through the dashboard.

**Hosted checks actually run:** `npm.cmd run check:supabase:public` passed **12 checks**: anonymous reads denied on five tables, anonymous calls denied on six RPCs (actual SQLSTATE 42501), and email authentication enabled with confirmation required. Hosted catalogue inspection verified fixed empty function search paths, anonymous EXECUTE denied, and the private ownership helper inaccessible to signed-in users. The security advisor reports five intentional authenticated SECURITY DEFINER entry points, reviewed in ARCHITECTURE.md. The three unindexed-foreign-key notices were fixed by the second migration and are absent on recheck. Only unused-index informational notices remained in the performance advisor when checked before fixtures were populated.

**Authentication setup:** both requested signup API calls were accepted. Account A's confirmed status was observed in database metadata, and its password login and initially empty private workspace passed a preliminary smoke check. Account B was first observed unconfirmed; the user then reported clicking the confirmation email, and its subsequent authenticated login succeeded in the live suite. Passwords, confirmation links, JWTs and Auth response bodies were not printed. This is API signup with user-assisted email confirmation; the signup form and email inbox were not automated end to end.

**Live suite completed:** `npm.cmd run test:database` passed all **13 checks** against hosted Supabase Auth and PostgREST. `npm.cmd run test:auth` passed both desktop/mobile browser cases in 18.2 seconds. No backend test remains blocked on credentials. Early missing-configuration refusals and initial browser skips are historical and are superseded by these successful live runs. No deployment occurred.

The local follow-up reran TypeScript, ESLint, 36 Vitest tests, 28 embedded SQL checks, 10 demo browser tests and the production build successfully. Embedded SQL was rerun after adding the index migration. `node --check tests/database.mjs` passed syntax validation. Historical initial skips are not included in the current demo test command; real auth now has its own runner that fails clearly when configuration is missing.

Date: **24 October 2026**, Africa/Johannesburg. Local Windows workspace: `C:\Users\setsh\Downloads\bizbridge-sa`. Node 25.8.0, npm 11.11.0. Dependency versions are pinned in package.json/package-lock.json.

## Completed checks

| Check | Actual result |
| --- | --- |
| TypeScript (`npm.cmd run typecheck`) | Passed, no type errors |
| ESLint (`npm.cmd run lint`) | Passed, no errors or warnings |
| Vitest (`npm.cmd test`) | **36 passed**, 1 test file |
| Embedded PostgreSQL (`npm.cmd run test:sql`) | **28 passed**, including application of the SQL migration |
| Playwright demo (`npm.cmd run test:e2e`) | **10 passed** across desktop and mobile; real auth is a separate command |
| Hosted public boundaries (`npm.cmd run check:supabase:public`) | **12 passed**; no signed-in claims |
| Live configuration (`npm.cmd run check:supabase`) | Passed; local fields and opt-in present |
| Hosted two-account API (`npm.cmd run test:database`) | **13 passed**, real Auth/PostgREST and concurrent requests |
| Real browser authentication (`npm.cmd run test:auth`) | **2 passed**, desktop and mobile, no skips |
| Production build (`npm.cmd run build`) | Passed with real public configuration; Vite produces `dist`. Non-blocking bundle-size warning: the main chunk is 547.75 kB minified (158.54 kB gzip). |
| Lockfile consistency (`npm.cmd ci --dry-run --ignore-scripts --offline`) | Passed |
| Dependency installation audit | npm reported **0 vulnerabilities** on the installed dependency tree; this is not a full security audit |

Initial attempts encountered Windows sandbox restrictions on localhost connections and Vitest temporary-file renames. After using the permitted execution path, tests ran successfully. Initial browser failures identified ambiguous form-label matching and delayed controlled-checkbox updates; those were corrected. The final results above replace those failed development runs.

## What was actually covered

**Unit/business rules:** exact decimal-to-cents parsing; invalid/negative/oversized inputs; whole-number stock; Johannesburg midnight/year boundaries; reporting periods; allowed categories/stages/payment labels; acceptance scenario; replay keys and changed-payload rejection; insufficient stock without mutation; historical snapshots and archive behavior; missing versus zero cost; safe aggregate ranges; stock adjustments; expense retry; readiness contributions, optional location, empty-business protection and no revenue reward.

**Embedded PostgreSQL:** ran the versioned migration in PGlite (PostgreSQL compiled to WebAssembly), with locally created `authenticated`/`anon` roles and two mock auth identities. Verified the acceptance sale/expense, persisted retry behavior, rollback on insufficient stock, immutable history, NULL costs, table constraints, one-owner uniqueness, restricted direct writes, blocked owner reassignment, archive behavior, expense replay, reasoned stock changes, RLS workspace isolation and explicit NULL-auth rejection inside privileged mutation functions. Account A could not access Account B's identifiers through SELECT, profile UPDATE or product/sale/expense/stock functions; B could not read A's transactions. Anonymous reads/functions and direct calls to the private helper were rejected.

**Browser:** Chromium through locally installed Microsoft Edge, desktop 1440×1000 and mobile 390×664 device viewport, plus narrow 320×740 layout checks. Opened explicit demo, verified initial acceptance totals, added a product, sold two units, recorded an expense, refreshed saved data, edited a price, checked unknown-cost warnings, adjusted stock, archived/restored a product, saved/reloaded readiness habits, reset to an empty business and completed profile onboarding. Leaving demo blocked private screens and cleared pending request keys. Two same-origin demo tabs could not oversell, and replaying the saved request key did not create a second sale. All six navigation screens fit the narrow viewport without horizontal overflow. Desktop/mobile dashboard and Growth Guide screenshots were visually reviewed.

**Live hosted API:** the same acceptance scenario passed through the deployed RPCs. Six simultaneous requests sharing one new key created exactly one sale, one negative stock movement and one stock reduction. Twelve distinct concurrent requests competing for five units yielded exactly five sales, seven specific insufficient-stock errors, five negative movements and zero remaining stock. An insufficient-stock rejection left the complete workspace unchanged. Product price/name/cost changes preserved sale snapshots, and unknown cost remained NULL. Both accounts had populated tables before two-way read and changed-ID mutation attacks. Direct writes, owner reassignment, anonymous reads and anonymous mutations were rejected with the expected permission code. A fresh authenticated client saw the saved records, and a signed-out client could no longer invoke the private workspace RPC.

**Real browser authentication:** Edge/Chromium on desktop and mobile used a fresh app server at `127.0.0.1:5174`, pointed explicitly at the test project. Password sign-in opened the saved dashboard; sales persisted identically across refresh. Logout removed the stored auth session and pending request keys, and revisiting `/sales` showed sign-in with no transaction records. No authentication traces, screenshots or videos were captured. These checks used real accounts and hosted records, not the demo store.

**Acceptance evidence:** isolated unit, embedded-SQL and hosted-Supabase fixtures start at 20 units, price 12,000 cents, cost 7,000 cents. A two-unit sale and 3,000-cent operating expense yield 18 stock, 24,000 revenue, 14,000 COGS, 10,000 gross profit and 7,000 estimated operating profit. The illustrative browser sample shows the same figures. Only the two explicitly selected live test accounts received fixtures; ordinary account signup still creates no sample business data. Later concurrency and missing-cost checks add further records, so the final test dashboard totals intentionally differ from the initial acceptance totals.

## Explicitly unrun or limited

- **Long-lived sessions:** timed access-token expiry/refresh, revoked-token replay and password recovery were not tested. Logout tests prove client session/cache removal and subsequent anonymous denial; they do not claim an already-issued JWT becomes instantly invalid.
- **Signup UI/email delivery:** signup API calls and user-assisted confirmation succeeded. An automated create-account-form → inbox → confirmation-link journey and general email deliverability tests were not run.
- **Database/load limits:** real simultaneous HTTP requests passed the concurrency suite, but high-load stress tests, database failover and direct local PostgreSQL tests were not run. Embedded PGlite still uses one connection and is not itself evidence of multi-connection locking.
- **Public deployment/Vercel headers:** prepared only. No deployment occurred; hosted redirect behavior and security headers are unverified. Test the approved production origin before release.
- Native Safari/iOS and Firefox, external accessibility audits, high-volume histories and disaster-recovery drills were not run. Mobile browser results use Chromium device emulation.

No external setup remains for the completed local test workflow. The two isolated businesses remain for inspection. The database fixture runner refuses to rerun against nonempty accounts; use new confirmed test identities or deliberately reset disposable fixtures before repeating it. Keep the test project separate from a future approved production environment. Production email configuration, URLs, backups and deployment verification remain release preparation.

## Reproduce

```powershell
cd C:\Users\setsh\Downloads\bizbridge-sa
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:sql
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run check:supabase:public
npm.cmd run check:supabase
# Requires fresh confirmed accounts before creating fixtures:
npm.cmd run test:database
npm.cmd run test:auth
```

Playwright uses installed Edge at its standard path, otherwise install Chromium with `npx.cmd playwright install chromium`. Demo traces/screenshots and HTML reports are ignored generated output under `test-results` and `playwright-report`. Real authentication disables these captures. Tests print no passwords, tokens or keys. The normal preview remains at `http://127.0.0.1:5173`; the temporary 5174 browser-test server stops when its suite finishes.
