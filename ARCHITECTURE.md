# Architecture and security notes

## Components

- `src/App.tsx`: Supabase Auth session gate, explicit demo entry, responsive shell and routes. Private screens only mount for a real session or explicitly selected demo.
- `src/store.tsx`: per-identity workspace provider. Real records live only in React memory; remounts isolate identities. Logout clears records/pending keys and local auth persistence immediately; stale async results cannot repopulate an unmounted provider.
- `src/backend.ts`: public Supabase client and RPC adapter. `get_workspace` obtains a single RLS-filtered consistent snapshot, avoiding silent 1,000-row API truncation.
- `src/demo.ts`: separate device-only illustrative repository; Web Locks serialize tabs. It has no authority over the database.
- `src/domain.ts`: data shapes, money/date validation, calculations and readiness rules. `src/forms.tsx`, `src/pages.tsx`, `src/components.tsx`: labelled forms and task-focused screens.
- `supabase/migrations/20261024210141_bizbridge_core.sql`: businesses, products, immutable sales, expenses, stock ledger, constraints, policies, grants and transactional functions.
- `supabase/migrations/20261024210433_bizbridge_reference_indexes.sql`: covering indexes for transaction foreign keys, added after the hosted advisor review.

## Money Split: private snapshots and versioned planning

`src/MoneySplit.tsx` supplies the page and native-dialog forms. `src/money-plan.ts` contains types, integer-cent totals, validation, read-only preview and the fictional reducer. `src/money-store.ts` uses the existing Supabase client and a route-scoped, identity/business/mode-keyed cache. `src/demo.ts` keeps fictional plans in `bizbridge.demo.money.v1.<businessId>` under Web Locks. No Money Split module calls sales, stock or expense mutations, and no money fields enter `metrics` or Growth Guide calculations.

Five new tables have explicit authenticated SELECT grants and owner-based RLS: `money_plan_state`, `money_allocations`, `money_cash_snapshots`, `money_withdrawals` and `money_plan_events`. There are no client INSERT/UPDATE/DELETE grants or write policies. Changed business IDs cannot bypass this boundary. `get_money_plan(business_id)` is SECURITY INVOKER, explicitly checks the caller's ownership, and returns one consistent JSON read of only that business. All relevant business/foreign-key columns are covered by composite unique indexes.

`change_money_plan` is the narrow SECURITY DEFINER write boundary. It fixes an empty search_path, qualifies relations, invokes the existing private authenticated ownership/row-lock helper before inspecting IDs, checks referenced allocations/withdrawals within the same business, validates payload fields and cents/date ranges, and revokes PUBLIC/anon execution. The function never writes existing sales/products/expenses/movements. Direct API writes cannot bypass its invariants.

All plan writes acquire the business row lock, validate a persisted operation UUID against its exact payload and base revision, then compare the expected plan revision. A matching retry returns the prior revision without replaying anything. A stale independent request returns **SQLSTATE PT409 / HTTP 409** and changes nothing. The frontend reloads and asks the owner to review again. Do not use SQLSTATE 40001 for this application conflict: PostgREST 14.18 can repeatedly retry it, as observed and repaired during hosted tests. See [Supabase's explanation](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions) and [PostgREST custom errors](https://docs.postgrest.org/en/v14/references/errors.html#custom-errors). The follow-up migration preserves deployed history and replaces only this error response.

The same transaction appends its event, updates an active allocation if needed, appends a cash snapshot and/or withdrawal where relevant, and advances revision. A supplied post-payment balance is a replacement value, never an amount to reduce again. Cancel/allocate operations create no cash snapshot. The highest snapshot revision determines current cash, independent of business date or timestamp ties. Allocation events keep previous values, cancelled/settled rows stay in history, and withdrawal corrections append a linked replacement with a reason and new actual cash snapshot. A completed entry cannot have two direct corrections; subsequent corrections target the latest entry.

Pending immutable requests use the app's existing scoped `bizbridge.pending.*` sessionStorage convention. They survive refresh and uncertain network responses, clear after confirmed outcomes/logout, and never cross business/identity keys. Loaded plans and drafts are memory-only; unmount and request epochs prevent late replies from repopulating another session. Failed loads remove displayed plan values instead of implying zero cash. Demo data is separately labelled and never becomes fallback data for a failed real request.

Both Money Split migrations are applied to the dedicated test project only. Hosted API tests created fictional planning records in the existing isolated fixture businesses and compared all existing transaction/stock data for equality. The advisor intentionally flags the authenticated SECURITY DEFINER entry point; its explicit checks and direct-write denials were verified. See [the advisor's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). The Auth advisor also reports leaked-password protection disabled in existing project settings; no Auth settings or paid features were changed. See [Auth password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No missing-RLS or missing-foreign-key-index finding was reported for Money Split.

## Read-only BizBridge Helper

`src/helper-guidance.ts` contains the prepared answers, ordered phrase/keyword intent map and pure response builders. `src/BizBridgeHelper.tsx` renders escaped React text and uses only the current workspace context. It never calls a backend, analytics or AI service, and never imports a mutation adapter. Navigation buttons point to existing pages without opening/submitting forms. Generic guidance is available on the welcome screen; private answers require the current authenticated identity or explicit fictional demo.

Dashboard and helper both call `businessReport` and `incompleteProfitMessage`; the workspace provider owns their shared reporting period and successful-retrieval timestamp. Stock and readiness answers reuse `lowStock` and `readiness`. Answers are derived from the latest workspace on each render, so saving through the existing app forms updates previously requested answers. Failed data replaces values with an unavailable message. Unknown historical costs remain incomplete.

Only questions (up to 20, at most 500 characters each) and the draft are stored, in component memory. A keyed subtree uses mode, authenticated user ID and business ID, synchronously discarding the conversation and rendered private answers when any changes. Provider cleanup and logout invalidate pending reads; late results cannot populate a different workspace. No chat history is written to localStorage or sessionStorage. Existing auth persistence and demo storage remain unchanged.

The nonmodal panel keeps app navigation available, returns focus on close, supports Escape/Enter/Tab, and resizes using the visible viewport. Synthetic development fixtures cover account/business transitions and delayed responses; the separate real-auth browser suite verifies read-only hosted summaries and logout clearing. Neither adds database permissions or new API keys. No schema or policy change was needed.

## Sale transaction and retry contract

1. Client validates quantity/date/method. Before sending, it persists a random UUID and the immutable request payload in identity/business-scoped sessionStorage. Busy state plus an immediate ref prevents same-tab double submission. Reloading the tab restores the pending request. A definitive SQL rejection clears it; uncertain network outcomes retain it for replay. Closing/reopening a dialog does not discard a pending request.
2. `record_sale` calls a private ownership helper. The helper rejects NULL `auth.uid()`, finds the caller's business and locks that business row `FOR UPDATE`. All mutation RPCs take the same lock first. This serializes mutations within one small business and protects idempotency checks even when two requests arrive together.
3. Look up `(business_id, idempotency_key)`. A matching request returns the original sale; a different payload using the same key is rejected.
4. Select the active referenced product **within that same owned business**, `FOR UPDATE`. Reject insufficient stock.
5. Insert the sale with current product name/price/cost snapshots, decrement stock, insert a stock movement, return the sale. PostgreSQL commits or rolls back the entire function invocation. The generated total is quantity × saved price.

The database persists the key on the sale. Its unique constraint is a second defence. Business locking simplifies lock order and prevents overselling; it trades write throughput for clarity in this first version. A narrower locking design can be introduced after measuring need. Pending requests survive tab refresh, but do not survive logout or deliberately closing/clearing the tab session; users should inspect saved transactions before manually re-entering a request after an interrupted session.

Expenses and manual stock adjustments also have persisted request IDs and payload-matching replay checks. Product creation has a busy guard but no server idempotency key; an uncertain network outcome may need checking the product list before adding again. Sales have stronger retry guarantees because they alter stock and financial records.

## Database boundaries

RLS is enabled on the five original business-record tables and the five Money Split tables. SELECT policies permit only the business owner. Businesses permit owner-scoped INSERT/UPDATE with column-level grants; owner IDs cannot be reassigned. Only authenticated clients get SELECT and the specific RPC EXECUTE grants. Anonymous and PUBLIC table/function grants are explicitly revoked.

There are **no authenticated INSERT/UPDATE/DELETE grants** for products, sales, expenses or movements. No client can bypass sale invariants with direct REST writes. Product edits and archive/restore pass through checked functions. Composite business/product foreign keys prevent cross-business references even if application code regresses.

Mutation functions are SECURITY DEFINER because the client has no direct write grants. Each invokes `private.lock_owned_business` before accessing product IDs, uses `search_path = ''` and schema-qualified tables. The private schema/function are not exposed to clients. Execute grants are enumerated. This explicit authorization is essential: definer functions do not rely on RLS for their privileged operations. `get_workspace` is SECURITY INVOKER, so its queries remain subject to RLS.

Database constraints validate lengths, values, enums, integer quantities and nonnegative stock. RPCs additionally reject future business dates using Africa/Johannesburg. SQL tests create two authenticated roles/identities and anonymous access in an embedded PostgreSQL database. Real PostgREST/Auth/multiple-connection tests are separate and require credentials.

## Money and checklist rules

Stored cents are `bigint` with a per-unit/per-expense ceiling of R1,000,000; stock and sale quantities are capped at 1,000,000 whole units. Per-sale products remain below JavaScript's safe integer limit. Aggregate totals use BigInt and reject results outside the safe display range. This bounds the prototype and avoids unchecked floating-point storage.

Profits with missing historical cost are incomplete, not understated by zero-cost assumptions. Product edits never rewrite history. All estimates exclude tax and unrecorded costs; no tax/compliance advice is generated.

Readiness weights: required profile fields 20 points; active-product cost coverage 35; active-product threshold coverage 20; three self-assessed record habits 25. Each coverage fraction × weight is rounded, then summed. No active products or no profile means no overall score. Optional location, revenue, identity documents and funding outcomes do not affect the score. Display the business-management-checklist disclaimer wherever an overall interpretation is offered.

## Operational limits / follow-up work

A dedicated free Supabase test project has been provisioned and both migrations applied; the web app has not been deployed. The live two-account/concurrency suite and desktop/mobile browser-auth tests passed on this project. Before real customer use, configure and verify production email delivery, Auth redirect URLs and backups/retention. A browser app stores a session token in Supabase's localStorage session store; same-origin XSS must be prevented. React escapes user text; there is no HTML injection API. Vercel headers restrict scripts/frames and network origins, but third-party dependency updates still require review. CSP custom-domain edits must be intentional.

The hosted security advisor flags the five authenticated SECURITY DEFINER mutation RPCs. These are intentional narrow entry points because clients cannot write transaction tables directly. Their fixed empty search paths, private ownership helper, explicit authenticated caller checks and restricted grants were checked on the hosted database. The 13 live API checks also passed, including changed-ID attacks in both directions. The warnings remain visible and require continued review when functions change; this is not a claim of a complete security audit. See [Supabase's advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). The follow-up index migration resolved the unindexed-foreign-key notices; unused-index informational notices remained when checked before fixtures were populated.

The entire small-business history is returned as one JSON snapshot. This prevents silent API pagination errors in v1, but needs paginated ledgers plus database reporting for large accounts. The UI shows the latest 50 stock movements while retaining all movement records. There is no collaborative editing or field-version conflict check for profile/product edits. Concurrent sales are protected at the database.

There are no refunds, corrections, sale/expense editing, password-recovery UI, account-deletion UI, exports, inventory-purchase accounting or audit-grade reporting. In particular, a past unknown cost cannot yet be repaired through the app; its warning is permanent in v1. Corrections require a separately designed audited adjustment workflow, not direct rewriting of historical snapshots. The profile is not official registration. No financial/payment credentials or sensitive identity documents are collected.

Reference implementation guidance checked against [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite).
