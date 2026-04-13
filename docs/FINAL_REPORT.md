# VanTrade — Final Architecture Report

**Course:** Software Architecture
**Date:** 2026-04-13
**Repository:** `vantrade` (pnpm monorepo)

---

## 1. Project Overview

**VanTrade** is a multi-tenant algorithmic trading strategy marketplace. Strategy **Providers** publish parameterized RSI-based trading Blueprints; **Testers** subscribe and execute them automatically against their personal Alpaca Paper Trading accounts; **Admins** verify Blueprints before they appear on the marketplace.

Scope is intentionally bounded to **paper trading** — no live money, no HFT, no ML model training.

### System at a Glance

```
vantrade/
├── apps/api/        NestJS REST API            (port 4000)
├── apps/web/        Next.js 14 frontend        (port 3000)
└── packages/types/  Shared Zod schemas + types (@vantrade/types)
```

**Build orchestration:** pnpm workspaces + Turborepo
**Database:** PostgreSQL via Prisma 5
**Broker:** Alpaca Paper Trading API

---

## 2. System Requirements

### 2.1 Functional Requirements

| # | Requirement | Implementation |
|---|---|---|
| FR-1 | Three distinct user roles with own responsibilities, permissions, and access control | `TESTER`, `PROVIDER`, `ADMIN` enforced via `RolesGuard` + `@Roles()` on every protected endpoint |
| FR-2 | Each role performs at least one CRUD operation | TESTER: subscribe/unsubscribe/toggle; PROVIDER: blueprint create/read/update/delete; ADMIN: verify blueprint, read all users |
| FR-3 | Secure login/logout, user authentication | JWT via Passport.js; bcryptjs password hashing; `JwtAuthGuard` on all protected routes |
| FR-4 | Role-based authorization and access control | Server-side `RolesGuard` — client cannot escalate privileges regardless of what it sends |
| FR-5 | From-scratch development | Full custom implementation; no boilerplate app templates used |

### 2.2 Non-Functional Requirements

| Attribute | Requirement | Mechanism |
|---|---|---|
| **Security** | Broker credentials must never be stored in plaintext | AES-256-GCM encryption at rest; decryption in-memory only at order time |
| **Security** | API surface must be rate-limited | `@nestjs/throttler` — 10 req/s burst, 200 req/min sustained |
| **Reliability** | One subscription failure must not stop others | `Promise.allSettled` in `HeartbeatService` |
| **Auditability** | Trade history must be immutable | Append-only `TradeLog` — no update or delete paths exist |
| **Maintainability** | Broker swap must require zero domain changes | Ports & Adapters — new adapter + one DI rebinding |
| **Testability** | Trading calculations must be verifiable in isolation | Pure functions in `trading.engine.ts` — no mocks needed |
| **Type Safety** | No type drift between API and frontend | Shared Zod schemas in `@vantrade/types` |

---

## 3. Database Design

### 3.1 Schema Overview

```
User
├── id, email, password (hashed), role (TESTER|PROVIDER|ADMIN)
├── apiKeys[]     → ApiKey
├── subscriptions[] → Subscription
└── blueprints[]  → Blueprint

Blueprint
├── id, title, description, symbol, parameters (Json)
├── isVerified, authorId → User
└── subscriptions[] → Subscription

Subscription
├── id, isActive
├── userId → User
├── blueprintId → Blueprint
└── tradeLogs[] → TradeLog

ApiKey
├── id, encryptedKey, encryptedSecret (AES-256-GCM)
├── label (default: "default")
├── userId → User
└── @@unique([userId, label])

TradeLog
├── id, signal, side (TradeSide enum: buy|sell|hold)
├── price, quantity, orderId, pnl, errorMessage
├── createdAt (append-only — no updatedAt)
└── subscriptionId → Subscription
```

### 3.2 Key Design Decisions

| Decision | Rationale |
|---|---|
| `TradeSide` as Prisma enum | Prevents casing inconsistencies (`"BUY"` vs `"buy"`) that break alternation logic |
| `Blueprint.parameters` as `Json` | Flexible enough for multiple strategy types; validated by Zod at application layer on every read |
| `@@unique([userId, label])` on `ApiKey` | Allows multiple broker accounts per user, identified by label |
| No `updatedAt` on `TradeLog` | Enforces append-only semantics — schema itself prevents accidental updates |
| `PrismaModule` declared `@Global()` | `PrismaService` available to all repositories without explicit imports in each module |

---

## 4. Architectural Methods Implemented

### 2.1 Hexagonal Architecture (Ports & Adapters)

The trading subsystem enforces strict three-layer separation across all broker-related logic.

| Layer | Location | Responsibility |
|---|---|---|
| **Domain** | `apps/api/src/trading/trading.engine.ts` | Pure functions only — RSI, SMA, signal generation, P&L |
| **Port** | `packages/types/src/interfaces/IBrokerAdapter.ts` | Interface contract that `HeartbeatService` depends on |
| **Adapter** | `apps/api/src/trading/broker/alpaca.adapter.ts` | Concrete Alpaca SDK implementation — the only file allowed to import the SDK |

**Domain layer functions:**

| Function | Purpose |
|---|---|
| `calculateRSI(prices, period)` | Wilder's smoothing RSI |
| `calculateSMA(prices, period)` | Simple Moving Average |
| `generateSignal(rsi, buyThreshold, sellThreshold)` | Returns `TradeSignal.BUY / SELL / HOLD` |
| `calculatePnL(entry, exit, qty, side)` | Realised profit/loss for a closed position |
| `calculateUnrealisedPnL(entry, current, qty)` | Mark-to-market P&L for an open position |

**Why this is suitable:** The domain layer has no infrastructure imports and no side effects. It is fully unit-testable with no mocks. This is a critical property in finance — calculation correctness must be provable in isolation, not inferred from end-to-end runs. The adapter pattern means broker migration requires writing one new file and changing one DI binding, with zero changes to domain or heartbeat logic.

**DI binding** (`apps/api/src/trading/trading.module.ts`):
```typescript
{ provide: 'IBrokerAdapter', useClass: AlpacaAdapter }
```

---

### 2.2 Repository Pattern

Every feature module has exactly one `*.repository.ts` that is the sole file permitted to import `PrismaService`. No controller or service touches the database directly.

| Repository | Key Methods |
|---|---|
| `AuthRepository` | `findByEmail`, `findById`, `create` |
| `BlueprintsRepository` | CRUD, `setVerified`, `findAllVerified`, `findByAuthor` |
| `SubscriptionsRepository` | `findByUser`, `findAllActive`, `setActive`, `findExisting` |
| `ApiKeysRepository` | `upsert`, `findByUser`, `delete` |
| `TradeLogsRepository` | `create`, `findBySubscription`, `getStats`, `findLatestTradeSideBySubscription` |

`PrismaModule` is declared `@Global()` so `PrismaService` is available to all repositories without explicit module imports.

**Why this is suitable:** Services remain focused on business rules and are decoupled from Prisma query syntax. Repository interfaces are straightforward to mock in service-level tests. Any future ORM migration only requires rewriting repository files.

---

### 2.3 NestJS Feature Modules (Thin Controller Pattern)

Ten feature modules each follow the same vertical slice structure:

```
<feature>.controller.ts   HTTP boundary — validate input, call service, return result
<feature>.service.ts      Business logic and orchestration
<feature>.repository.ts   Database access (Prisma only)
<feature>.module.ts       DI wiring
```

**Thin Controller Rule:** Controllers do exactly three things — validate with `ZodValidationPipe`, call one service method, return the result. No `if/else`, no Prisma, no SDK calls inside controllers.

| Module | Role |
|---|---|
| `AuthModule` | JWT login/register, Passport strategy |
| `BlueprintsModule` | Marketplace CRUD, admin verification gate, backtest |
| `SubscriptionsModule` | Subscribe/unsubscribe, toggle active, stats |
| `TradingModule` | Exports `IBrokerAdapter` DI token |
| `HeartbeatModule` | Background cron execution engine |
| `EncryptionModule` | AES-256-GCM key encryption/decryption |
| `ApiKeysModule` | Broker credential management |
| `MarketDataModule` | Real-time price/bars endpoint for UI |
| `TradeLogsModule` | Exports `TradeLogsRepository` |
| `PrismaModule` | Global database connection |

**Why this is suitable:** Each slice is independently developable and testable. The thin controller rule keeps HTTP handling trivial and ensures all business logic is reachable from tests without spinning up HTTP.

---

### 2.4 Heartbeat Execution Loop

**File:** `apps/api/src/heartbeat/heartbeat.service.ts`
**Schedule:** `@Cron('*/60 * * * * *')` — fires every 60 seconds

The heartbeat is the core runtime engine. On each tick it processes all active subscriptions in parallel with `Promise.allSettled`, so a single failure does not block others.

**Per-subscription processing pipeline:**

```
1.  Validate blueprint parameters (Zod)
2.  Check market hours
        — Stocks:  9:30 AM – 4:00 PM ET, weekdays only
        — Crypto:  24/7 (USD/USDT suffix detection)
3.  Check timeframe boundary alignment (5Min, 15Min, 1Hour, 1Day)
4.  Fetch (rsiPeriod + 1) OHLCV bars via IBrokerAdapter
5.  calculateRSI()       ← pure domain function
6.  generateSignal()     ← pure domain function
7.  Smart side resolution:
        — Read last executed side from TradeLog
        — Enforce BUY→SELL→BUY alternation
        — Skip if signal does not match expected next side
8.  Decrypt user API key via EncryptionService (in-memory only)
9.  placeOrderWithCredentials() via IBrokerAdapter
10. Persist TradeLog (append-only, including HOLDs)
```

**Why this is suitable:** `Promise.allSettled` provides fault isolation essential for a multi-tenant system — one user's invalid credentials cannot stall another user's trade. The market-hours and timeframe-alignment guards prevent generating noise signals. The smart side resolution prevents double-buys or double-sells that would distort P&L accounting.

---

### 2.5 Append-Only Trade Ledger

`TradeLog` rows are never updated or deleted. `TradeLogsRepository` exposes only `create` — no `update` or `delete` methods exist. Every execution outcome (filled order, hold, error) is appended as a new row.

**Why this is suitable:** An immutable ledger is a standard practice for financial audit trails. Any position can be reconstructed or any P&L re-calculated from the log alone. The append-only constraint also enables the smart side resolver: it reads `findLatestTradeSideBySubscription` to determine what the next expected trade direction should be.

---

### 2.6 Encrypted Credential Storage

**File:** `apps/api/src/encryption/encryption.service.ts`

Broker API keys are encrypted with **AES-256-GCM** before database storage. The encryption key is `scrypt`-derived from the `ENCRYPTION_KEY` environment variable. Decrypted values are computed in-memory at order time and passed as function arguments to the adapter — never stored on the adapter instance.

**Storage format:** `iv:authTag:ciphertext` (all hex, colon-delimited) in the `ApiKey` table.

**Why this is suitable:** Even if the database is fully compromised, raw API keys are not exposed. AES-256-GCM provides authenticated encryption — any tampering of the stored ciphertext is detected before decryption. The "pass as argument, never store" rule prevents credentials from leaking through object state or logs.

---

### 2.7 Shared Type Package (`@vantrade/types`)

All Zod schemas and TypeScript interfaces live in `packages/types/src/`. Both `apps/api` and `apps/web` import from this package.

```
packages/types/src/
├── enums.ts                  Role, OrderSide, TradeSignal, OrderStatus
├── interfaces/
│   ├── IBrokerAdapter.ts     Port interface + broker-related types
│   └── index.ts              JwtPayload, BlueprintParameters, Position, ...
└── schemas/
    ├── auth.schema.ts
    ├── blueprint.schema.ts
    ├── backtest.schema.ts
    ├── market-data.schema.ts
    ├── subscription.schema.ts
    └── trade-log.schema.ts
```

Zod schemas serve double duty:
- **API layer:** `ZodValidationPipe` validates incoming request bodies and query params
- **Web layer:** `base.ts` API client parses and validates API responses at runtime

**Why this is suitable:** A single schema change propagates to both apps at compile time. There is no duplicated type definition to drift out of sync. TypeScript's `z.infer<typeof Schema>` derives static types from the schema, giving end-to-end type safety from database model to React component.

---

### 2.8 Role-Based Access Control (RBAC)

**Files:** `auth/roles.guard.ts`, `auth/roles.decorator.ts`, `auth/jwt-auth.guard.ts`

Every protected endpoint uses `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles(Role.X)`. Registration always assigns `Role.TESTER` — role is never accepted from the request body. Privileged roles (PROVIDER, ADMIN) are assigned by an admin only.

| Role | Permissions |
|---|---|
| `TESTER` | Browse marketplace, subscribe to blueprints, manage API keys, view own trade logs |
| `PROVIDER` | All TESTER permissions + create, edit, delete own blueprints |
| `ADMIN` | All permissions + verify blueprints, view all users and blueprints |

**Why this is suitable:** Server-side enforcement means the client cannot escalate privileges regardless of what it sends. The decorator pattern keeps role requirements co-located with the route definition, making the security posture easy to audit in a single file pass.

---

### 2.9 Backtest Simulation Engine

**Files:** `apps/api/src/blueprints/blueprints.service.ts`

Blueprints expose two backtest endpoints:

| Endpoint | Mode |
|---|---|
| `GET /api/blueprints/:id/backtest` | Backtest against saved Blueprint parameters |
| `POST /api/blueprints/backtest` | Ad-hoc preview with arbitrary parameters |

The service fetches historical bars, replays the RSI signal over them, and simulates a trade sequence (long or short). Output includes per-trade P&L, win rate, total return, trade count, and an equity curve array.

**Why this is suitable:** Testers can evaluate a Blueprint's historical performance before committing to a live subscription. The two-endpoint design separates "evaluating a known Blueprint" from "exploring parameter sensitivity" — a useful distinction for the Provider workflow.

---

### 2.10 Typed Frontend API Client Layer

**Directory:** `apps/web/src/lib/api-client/`

All HTTP communication goes through named client functions (one file per entity). Each function calls the generic `apiClient` from `base.ts`, which:
- Attaches `Authorization: Bearer` header automatically
- Parses responses through the corresponding Zod schema
- Throws `ApiError` with HTTP status on non-2xx responses

React pages import these named functions — never `fetch` directly. HTTP logic is in one place; pages contain only UI concerns.

---

## 5. Results

The following capabilities were successfully implemented and are functional end-to-end:

| Capability | Status |
|---|---|
| Multi-role user system (PROVIDER / TESTER / ADMIN) | Complete |
| Blueprint CRUD with admin verification gate | Complete |
| RSI-based signal engine — pure functions, fully tested | Complete |
| Heartbeat auto-execution every 60 seconds | Complete |
| Per-user encrypted Alpaca API credentials | Complete |
| Backtest simulation with equity curve | Complete |
| Live market bar fetching — stocks and crypto | Complete |
| Open positions viewer (per-user, credential-delegated) | Complete |
| Subscription stats and paginated trade log | Complete |
| Immutable append-only TradeLog audit trail | Complete |
| Shared Zod contracts between API and Web | Complete |
| Role-enforced API surface | Complete |
| Symbol normalization (AAPL, BTC/USD, BTCUSD variants) | Complete |
| Market hours guard — ET hours for stocks, 24/7 for crypto | Complete |
| Timeframe boundary alignment (5Min, 15Min, 1Hour, 1Day) | Complete |
| Smart trade side alternation enforcement | Complete |

**Test coverage:**
- `trading.engine.ts` — fully covered with a dedicated 101-line spec
- `blueprints.service.ts` — backtest and dry-run logic covered with a 332-line spec
- `apps/web/src/lib/api-client/base.ts` — fetch wrapper covered (Zod validation, error handling, 204 handling)

---

## 6. Flaws, Known Gaps, and Resolutions

### 4.1 Incomplete Test Coverage

**Status: Partially resolved**

The 80% coverage target applies only to `apps/api/src/trading/`. Several high-risk areas had minimal or empty specs.

| File | Original gap | Resolution |
|---|---|---|
| `heartbeat.service.spec.ts` | Market hours, side resolution, error isolation, credential decryption untested | Already comprehensive — 13 tests covering all branches |
| `api-keys.service.spec.ts` | Only `verify()` was tested | **Fixed:** Full suite added — `upsert` (encrypts both fields, custom label, confirmation), `hasKey` (true/false), `listKeys` (maps labels, empty), `remove` (not found, by label, confirmation), `verify` (not found, decrypts, valid/invalid, custom label) |
| `subscriptions.service.spec.ts` | Only `getStats()` and pagination tested | **Fixed:** Added `create` (blueprint not found, unverified, already subscribed, happy path), `toggle` (not found, wrong user, activate, deactivate), `remove` (not found, wrong user, happy path), `findByUser` |
| `positions.service.spec.ts` | Untested | Already resolved in a prior session — 4 tests covering not-found, decryption, positions list, empty positions |
| Web components | No unit or integration tests | Remains unresolved — no React testing framework configured |

---

### 4.2 `TradeLog.side` Stored as Untyped String

**Status: Resolved**

**Problem:** `TradeLog.side` was a plain `String` column. Any inconsistency in casing (`"BUY"` vs `"buy"`) silently broke the trade alternation logic in the heartbeat service.

**Fix applied:**

- **`prisma/schema.prisma`**: Added `enum TradeSide { buy sell hold }`. Changed `TradeLog.side` from `String` to `TradeSide`.
- **`trade-logs/trade-logs.repository.ts`**: `CreateTradeLogData.side` typed as `TradeSide` (imported from `@prisma/client`). Values are string-compatible with the existing `TradeSignal` enum (`'buy' | 'sell' | 'hold'`), so no call sites required changes.

The database now rejects any `side` value outside the enum at write time.

> **Migration required:** Run `pnpm --filter api prisma:migrate` after pulling this change.

---

### 4.3 Blueprint Parameters Stored as Untyped JSON

**Status: Partially mitigated (not fully resolved)**

**Problem:** `Blueprint.parameters` is stored as `Json`. Out-of-band DB inserts can persist malformed parameters that the heartbeat silently skips at runtime.

**Current mitigation:** The heartbeat service runs `BlueprintParametersSchema.safeParse()` on every tick before processing a subscription. Any malformed blueprint is logged and skipped without crashing the loop. The same Zod parse is applied in the blueprint service at creation and update time.

**Remaining gap:** No database-level constraint prevents a direct SQL insert from bypassing validation. A full fix (normalised `BlueprintParameters` table) was out of scope for this iteration.

---

### 4.4 No Caching on Market Data Fetches

**Status: Resolved**

**Problem:** Every heartbeat tick issued a fresh Alpaca API call per subscription. 50 subscriptions on the same symbol+timeframe = 50 identical requests per minute, easily hitting rate limits.

**Fix applied** (`heartbeat.service.ts`):

- Added a `Map<string, { bars, fetchedAt }>` cache keyed on `"symbol:timeframe:limit"`.
- Cache TTLs match the timeframe resolution:

| Timeframe | TTL |
|---|---|
| 1Min | 60 s |
| 5Min | 5 min |
| 15Min | 15 min |
| 1Hour | 60 min |
| 1Day | 24 h |

- All bar fetches go through `getCachedBars()` instead of calling the broker directly.
- The cache is wiped at the start of each tick so data never carries over across tick boundaries.

---

### 4.5 No API Rate Limiting

**Status: Resolved**

**Problem:** No request rate limiting — the backtest endpoint was fully open to abuse.

**Fix applied:**

- **`apps/api/package.json`**: Added `@nestjs/throttler ^6.0.0`.
- **`app.module.ts`**: `ThrottlerModule` configured with two tiers, applied globally via `ThrottlerGuard`:

| Tier | Window | Limit |
|---|---|---|
| `short` | 1 s | 10 requests — burst protection |
| `medium` | 60 s | 200 requests — sustained limit |

> **Install required:** Run `pnpm install` to pull the new package.

---

### 4.6 Backtest Quality Is Optimistic

**Status: Resolved (slippage, commission, drawdown, Sharpe — portfolio correlation remains open)**

**Problem:** All fills assumed exact closing price; no fees; no risk metrics.

**Fix applied:**

*New optional query parameters* (`BacktestQuerySchema`, `BlueprintBacktestPreviewSchema`):

| Parameter | Default | Effect |
|---|---|---|
| `slippagePct` | `0` | % added to buy fills, subtracted from sell fills |
| `commissionPerTrade` | `0` | Flat $ deducted twice per round trip (entry + exit) |

*New output fields* (`BacktestResultSchema`):

| Field | Description |
|---|---|
| `maxDrawdown` | Peak-to-trough equity drop (in $ units) |
| `sharpeRatio` | Annualised Sharpe ratio (risk-free rate = 0, proxy: 252 trades/year) |

**Files changed:** `packages/types/src/schemas/backtest.schema.ts`, `apps/api/src/blueprints/blueprints.service.ts`.

**Remaining gap:** Portfolio-level correlation analysis and look-ahead bias enforcement are not implemented.

---

### 4.7 Market Hours Timezone Is Hardcoded

**Status: Resolved**

**Problem:** `market-hours.util.ts` hardcoded `'America/New_York'`. A server in a different timezone would silently miscalculate market open/close.

**Fix applied** (`heartbeat/market-hours.util.ts`):

```typescript
const US_MARKET_TIMEZONE = process.env.MARKET_TIMEZONE ?? 'America/New_York';
```

**`apps/api/.env.example`** updated with a documented `MARKET_TIMEZONE` entry. The default is unchanged for existing deployments.

---

### 4.8 One API Key Per User

**Status: Resolved**

**Problem:** A unique constraint on `ApiKey.userId` limited each user to one brokerage account with no way to label or distinguish keys.

**Fix applied:**

- **`prisma/schema.prisma`**: Removed `@unique` on `userId`. Added `label String @default("default")`. New composite unique: `@@unique([userId, label])`.
- **`api-keys.repository.ts`**: `findByUser` now returns an array. Added `findByUserAndLabel`. `upsert` and `delete` are label-keyed.
- **`api-keys.service.ts`**: Added `listKeys()`. `remove()` accepts a label. `verify()` accepts an optional `label` argument.
- **`api-keys.controller.ts`**: Added `GET /api/api-keys` list endpoint. `DELETE` body now carries `{ label }`. `POST /verify` accepts `?label=` query param.
- **`packages/types/src/schemas/api-key.schema.ts`**: Added `label` to `ApiKeyCreateSchema`; new `ApiKeyDeleteSchema`; new `ApiKeyListResponseSchema`.
- **`heartbeat.service.ts`**: Resolves the key to use by preferring `label === "default"`, then falling back to `apiKeys[0]`.

> **Migration required:** Run `pnpm --filter api prisma:migrate` after pulling this change.

---

### 4.9 No Structured Logging or Observability

**Status: Resolved (structured JSON logging — metrics and alerting remain open)**

**Problem:** The API emitted unstructured plain-text logs from NestJS's built-in `Logger`, making log aggregation and automated alerting impractical.

**Fix applied:**

- **`common/logger/json-logger.service.ts`** (new): `JsonLoggerService` extends `ConsoleLogger`. Every log call emits a newline-delimited JSON record:

```json
{"timestamp":"2026-04-13T10:00:00.000Z","level":"log","context":"HeartbeatService","message":"Processing 12 active subscriptions"}
```

- **`main.ts`**: `NestFactory.create(AppModule, { logger: new JsonLoggerService() })` — replaces the default coloured logger globally.
- **`common/interceptors/logging.interceptor.ts`**: Updated to emit structured fields — `method`, `path`, `statusCode`, `durationMs`, `ip` — as a JSON string through the logger.

**Remaining gap:** Per-subscription heartbeat metrics (signal distribution, error rates) and alerting on repeated failures are not yet implemented.

---

### 4.10 No User Notifications

**Status: Not resolved**

**Problem:** Testers must poll the trade logs UI to learn about fills, errors, or deactivations. There is no push mechanism.

**Reason not addressed:** Implementing notifications requires a new persistence model (e.g., `Notification` table), a delivery channel (WebSockets, SSE, or email), and matching frontend integration — a scope that exceeds a targeted bug-fix iteration.

---

## 7. Architecture Decision Summary

| Decision | Pattern Applied | Location |
|---|---|---|
| Broker-agnostic trading logic | Hexagonal / Ports & Adapters | `IBrokerAdapter` + `AlpacaAdapter` + `trading.engine.ts` |
| Database access isolation | Repository Pattern | One `*.repository.ts` per feature module |
| HTTP request handling | Thin Controller (validate → service → return) | All `*.controller.ts` files |
| Feature separation | NestJS Feature Modules | 10 modules, vertical slice structure |
| Shared type contracts | Single source of truth | `packages/types` — Zod schemas + interfaces |
| Broker injection | Dependency Injection (string token) | `'IBrokerAdapter'` in `TradingModule` |
| Role enforcement | RBAC via Guards | `JwtAuthGuard` + `RolesGuard` + `@Roles()` |
| Background execution | Cron + `Promise.allSettled` | `HeartbeatService` |
| Credential security | AES-256-GCM, in-memory decryption only | `EncryptionService` + `ApiKeysService` |
| Audit trail | Append-only ledger | `TradeLog` — no update/delete |
| End-to-end type safety | TypeScript + Zod | DB schema → API → React component |
| Build efficiency | Monorepo with cache | Turborepo + pnpm workspaces |
