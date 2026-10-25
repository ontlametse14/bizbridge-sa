# BizBridge SA conventions

Work only in this `bizbridge-sa` directory. The parent Downloads folder contains unrelated user files. Read README.md, ARCHITECTURE.md and TESTING.md before changing transaction/security behavior. No deployment, paid resources, repository publication or production data changes without user authorisation.

## Stack and commands

- React + TypeScript + Vite, Tailwind CSS v4, Lucide, Supabase. npm with committed package-lock.json. Prefer a supported Node LTS version (24).
- `npm.cmd ci` on Windows; `npm ci` on other platforms.
- `npm.cmd run dev -- --port 5173 --strictPort`
- Required: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:sql`, `npm.cmd run build`.
- Demo browser: `npm.cmd run test:e2e`. Use installed Edge or Playwright Chromium.
- Real browser auth: `npm.cmd run test:auth`, after `npm.cmd run check:supabase` and the live database fixture suite. Starts a separate server on 5174. Missing configuration fails explicitly. Never enable trace, screenshot or video capture for authentication tests; do not serialize Auth responses into assertion errors.
- Live integration: `npm.cmd run test:database` only on a disposable Supabase project with two fresh confirmed accounts and explicit fixture opt-in. A missing configuration is an unrun check, not a pass.
- Public hosted checks: `npm.cmd run check:supabase:public` verifies anonymous database denials and email-confirmation settings without test passwords.

## Domain invariants

- Money is integer cents; validate before storage and keep sums within safe integer range. Currency is ZAR/en-ZA. All business dates use Africa/Johannesburg, including day boundaries and date validation.
- NULL unit cost means unknown, never zero. Any unknown cost in a reporting period makes profit incomplete. Historical sale snapshots are immutable.
- Recording a sale, decrementing stock and writing its movement must remain one PostgreSQL transaction. Do not replace RPCs with separate browser requests. Preserve persisted idempotency keys, payload checks, business locks and product row locks.
- Enforce ownership and referenced IDs inside every privileged mutation. All SECURITY DEFINER functions must fix search_path and qualify tables. Restrict grants and EXECUTE. No direct client writes to products, sales, expenses or movements. RLS applies to every exposed table.
- Preserve archived product history. Stock uses whole numbers, nonnegative final quantities and reasoned adjustments. Inventory purchases are not operating expenses.
- Demo and real records have separate stores. Never switch modes on backend failure. Demo fixture changes belong only in src/demo.ts. Never seed samples into all new accounts.
- No revenue-based readiness reward. Show contributions and explanations; no score for empty businesses. Keep the checklist disclaimer visible.

## Frontend conventions

Money Split is a snapshot plan, separate from all sales/expense/stock/profit calculations. Confirmed cash replaces the previous snapshot; never subtract a completed withdrawal/payment again. Active allocations are planning amounts only. Keep append-only events, snapshots and withdrawal corrections; deny direct API writes. Every mutation must preserve its persisted request key, expected revision, owned-business lock and atomic commit. Return PT409 for an application revision conflict, never SQLSTATE 40001 (PostgREST retry-loop risk). The two Money Split migrations are applied to the dedicated test project: `20261025145211_money_split.sql` and `20261025150354_money_split_conflict_response.sql`. Never reapply or rewrite deployed migrations. `test:sql` includes Money Split; `test:money:api` writes only guarded isolated planning fixtures and refuses nonempty plans. Do not reset a plan to rerun tests. Use the existing memory-scoped loader and separate fictional storage.

Use existing form, notice, modal and workspace patterns. Semantic controls, explicit labels and described hints. Render user input as React text, never unsafe HTML. Respect reduced motion and test at 320px/390px and desktop widths. Keep original BizBridge SA/SeTshedi branding. All visible actions need functioning handlers and error states.

BizBridge Helper is rules-based and read-only. Keep prepared guidance and intent matching in `src/helper-guidance.ts`, separate from its panel. Reuse the workspace, shared Dashboard reporting period/calculations, low-stock and readiness rules; do not add helper networking, mutation calls or persisted chat. Clear conversations by identity/business/mode and reject stale workspace reads. Extend `src/helper.test.ts` and `tests/browser/helper.spec.ts` for changes. `test:e2e` includes demo and synthetic helper fixtures; these do not prove hosted access controls. `test:auth` reads existing hosted fixtures and checks helper logout clearing without business-record writes.

Do not persist real business records in localStorage. Clear in-memory records and pending operation keys on logout; reject stale async reads after unmount. Authentication lives in Supabase's session store. Retry payloads live in scoped sessionStorage only until confirmation or logout.

Never print tokens, passwords, keys or environment-file contents. Only frontend publishable configuration belongs in VITE_ variables. Keep `.env*` ignored except example templates. Do not use service-role keys in frontend or integration tests.

Update TESTING.md with what actually ran. Distinguish embedded SQL checks, demo-browser checks and real Supabase multi-connection tests. Add a new migration for subsequent deployed schema changes instead of rewriting history. Both migrations have been applied to the dedicated free `bizbridge-sa-test` project (`ekwwyxrjdqrigfggncff`). Their filenames match the integration-assigned remote migration versions. Do not reapply them or use the unrelated BUSANG STUDIO project.
