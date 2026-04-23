# VanTrade Architecture Summary

This document justifies the architectural practices applied in VanTrade, a multi-tenant algorithmic trading strategy marketplace built for the Software Architecture course. Each section maps a concrete architectural decision to the files and code where it is implemented.

---

## 1. Monorepo with Turborepo (Workspace Architecture)

**Pattern:** Multi-package monorepo with orchestrated builds.

VanTrade is organized as a single repository containing three independently deployable packages managed by **pnpm workspaces** and **Turborepo**:

```
vantrade/
├── apps/api/          NestJS REST API  (port 4000)
├── apps/web/          Next.js frontend (port 3000)
└── packages/types/    Shared Zod schemas + TypeScript interfaces
```

**Why it matters:**
- A single `pnpm install` at the root wires everything together, eliminating the coordination overhead of managing separate repositories for a small team.
- Turborepo caches build artifacts (`turbo.json`) so unchanged packages are not rebuilt, keeping CI fast as the codebase grows.
- `@vantrade/types` is resolved locally via workspace linking — no publish step needed to share contracts between API and web.

**Trade-offs:**
- A single repository means a single CI pipeline; a broken test in `apps/web` can block an unrelated `apps/api` deployment.
- Turborepo configuration adds tooling complexity that must be understood by every contributor.
- Workspace linking means all packages must be built together; the monorepo does not enforce independent deployment cadences.

**Key file:** `turbo.json`, `pnpm-workspace.yaml`

---

## 2. Hexagonal Architecture (Ports & Adapters)

**Pattern:** Domain logic is isolated from infrastructure via explicit port interfaces and swappable adapters.

The trading subsystem enforces three strict layers:

### 2.1 Domain Layer — Pure Functions

**File:** `apps/api/src/trading/trading.engine.ts`

Contains only pure, stateless functions with zero infrastructure imports:

| Function | Purpose |
|---|---|
| `calculateRSI(prices, period)` | Wilder's smoothing RSI |
| `calculateSMA(prices, period)` | Simple Moving Average |
| `generateSignal(rsi, buy, sell)` | BUY / SELL / HOLD decision |
| `calculatePnL(entry, exit, qty, side)` | Realised profit/loss |
| `calculateUnrealisedPnL(...)` | Mark-to-market PnL |

Because these are pure functions, they are fully unit-testable without any database or network mock.

### 2.2 Port — IBrokerAdapter Interface

**File:** `packages/types/src/interfaces/IBrokerAdapter.ts`

```typescript
export interface IBrokerAdapter {
  getHistoricalPrices(symbol: string, limit: number): Promise<number[]>;
  getLatestPrice(symbol: string): Promise<number>;
  getRecentBars(symbol, timeframe, limit): Promise<MarketBarDto[]>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  placeOrderWithCredentials(params, key, secret): Promise<OrderResult>;
  getPositions(accountId: string): Promise<Position[]>;
}
```

The `HeartbeatService` depends on this interface, **not** on Alpaca. The interface lives in `packages/types` (not in `apps/api`) so it has no dependency on any broker SDK.

### 2.3 Adapter — AlpacaAdapter

**File:** `apps/api/src/trading/broker/alpaca.adapter.ts`

The **only** file in the entire codebase that imports `@alpacahq/alpaca-trade-api`. Implements all six methods of `IBrokerAdapter`. Handles:
- Symbol normalization (AAPL, BTCUSD, BTC/USD)
- Multiple timeframes (1Min → 1Day)
- System credentials for read-only market data vs. per-user credentials for order execution

### 2.4 Binding via Dependency Injection

**File:** `apps/api/src/trading/trading.module.ts`

```typescript
@Module({
  providers: [{ provide: 'IBrokerAdapter', useClass: AlpacaAdapter }],
  exports: ['IBrokerAdapter'],
})
```

To swap to a different broker, only this binding changes — zero modifications to domain logic or the heartbeat service.

**Why it matters (business driver):** A trading platform has an obligation to users that its financial calculations are correct and demonstrably verifiable — not just "probably right" based on end-to-end runs. Pure domain functions satisfy this obligation: they can be proven correct with unit tests against known inputs, independently of any network or database state. The adapter boundary also protects the platform from vendor lock-in; if Alpaca changes its API or pricing, migration is a single-file change rather than a codebase-wide refactor.

**Trade-offs:**
- The `IBrokerAdapter` interface must be updated whenever a new broker capability is needed; every existing adapter must implement the new method even if it is unsupported.
- Three layers of indirection (domain → port → adapter) make it harder to trace a single execution path during debugging.
- Pure functions cannot encapsulate state, so any stateful caching (e.g., bar cache) must live outside the domain layer.

---

## 3. Repository Pattern

**Pattern:** Each feature module owns a dedicated repository class that is the sole point of database access.

**Rule enforced:** Only `*.repository.ts` files may import `PrismaService`. No controller or service touches the database directly.

| Repository | File | Responsibility |
|---|---|---|
| `SubscriptionsRepository` | `subscriptions/subscriptions.repository.ts` | CRUD + `findAllActive()` for heartbeat |
| `TradeLogsRepository` | `trade-logs/trade-logs.repository.ts` | Append-only trade log writes and reads |
| `BlueprintsRepository` | `blueprints/blueprints.repository.ts` | Marketplace CRUD + admin queries |
| `ApiKeysRepository` | `api-keys/api-keys.repository.ts` | Encrypted credential storage |
| `AuthRepository` | `auth/auth.repository.ts` | User lookup, creation, and role assignment |

**PrismaModule** is declared `@Global()` in `apps/api/src/prisma/prisma.module.ts` so `PrismaService` is injected into repositories without requiring explicit module imports everywhere.

**Why it matters (business driver):** Financial platforms need the ability to audit, migrate, or replace their persistence layer without touching business rules. By confining all Prisma access to repository files, the repository layer can be rewritten (e.g., switching ORMs, adding read replicas, migrating to a different database) without any risk of accidentally altering the subscription logic, heartbeat, or RBAC behaviour.

**Trade-offs:**
- Every new database query requires a dedicated method in the repository, which can lead to query proliferation as the feature set grows.
- Service-level tests must mock the entire repository interface, creating test boilerplate that must stay in sync with the real repository.
- The `@Global()` PrismaModule means `PrismaService` is available everywhere, relying on developer discipline to keep it out of non-repository files.

---

## 4. Layered NestJS Feature Modules

**Pattern:** Vertical slice architecture — each feature is a self-contained module with Controller → Service → Repository.

The API contains **10 feature modules**, each following the same structure:

```
<feature>.controller.ts   HTTP boundary, validates input, calls service
<feature>.service.ts      Business logic, orchestration
<feature>.repository.ts   Database queries (Prisma only)
<feature>.module.ts       DI wiring
```

| Module | Role |
|---|---|
| `AuthModule` | JWT login/register, Passport strategy |
| `BlueprintsModule` | Marketplace CRUD, admin verification gate |
| `SubscriptionsModule` | Subscribe/unsubscribe, toggle active |
| `TradingModule` | Exports `IBrokerAdapter` DI token |
| `HeartbeatModule` | Background cron execution engine |
| `EncryptionModule` | AES-256-GCM key encryption/decryption |
| `ApiKeysModule` | Broker credential management |
| `MarketDataModule` | Real-time price endpoint for UI |
| `TradeLogsModule` | Exports `TradeLogsRepository` |
| `PrismaModule` | Global database connection |

**Thin Controller Rule:** Controllers do exactly three things — validate with `ZodValidationPipe`, call one service method, return the result. No conditionals, no Prisma, no SDK calls inside controllers.

**Trade-offs:**
- Vertical slices can lead to duplicated utility logic across modules if shared abstractions are not extracted into common packages.
- The thin controller rule means debugging requires navigating an extra indirection layer (controller → service) before reaching the actual logic.
- Ten modules add NestJS DI boilerplate; wiring cross-module dependencies (e.g., `TradeLogsModule` exported into `HeartbeatModule`) requires explicit `imports` declarations in each module file.

---

## 5. Background Processing — Heartbeat Execution Loop

**Pattern:** Event-driven scheduling (cron-based) with fault-isolated concurrent execution.

**File:** `apps/api/src/heartbeat/heartbeat.service.ts`

The heartbeat is the core engine that executes all active trading subscriptions on a recurring schedule:

```
@Cron('*/60 * * * * *')  ← fires every 60 seconds
tick()
 └── findAllActive() subscriptions
     └── Promise.allSettled()  ← parallel, fault-isolated
         └── processSub(sub) per subscription
             1. Validate blueprint parameters (Zod)
             2. Check market hours (stocks: 9:30–16:00 ET; crypto: 24/7)
             3. Check timeframe boundary alignment
             4. Fetch recent OHLCV bars via IBrokerAdapter
             5. calculateRSI() — pure domain function
             6. generateSignal() — pure domain function
             7. Enforce alternation (BUY→SELL→BUY, no double-buy)
             8. Decrypt user API keys via EncryptionService
             9. placeOrderWithCredentials() via IBrokerAdapter
            10. Persist TradeLog (append-only)
```

**`Promise.allSettled()`** ensures that a failure in one subscription (e.g., invalid credentials, network error) does not block or cancel execution for all other subscriptions.

**Why it matters (business driver):** In a multi-tenant platform, one user's misconfigured API key or expired credentials must not cause financial harm to other users by blocking their automated trades. `Promise.allSettled` makes fault isolation a structural guarantee rather than a best-effort try/catch.

**Trade-offs:**
- A fixed 60-second tick means all subscriptions share the same schedule; there is no per-subscription granularity (e.g., a user cannot choose a 30-second cadence).
- A slow Alpaca response for one subscription occupies a Promise slot for the full duration of its timeout, reducing effective parallelism.
- The heartbeat runs in-process inside the NestJS API; under high subscription load it competes for CPU with HTTP request handling.
- Cron-based scheduling has no built-in backpressure; if one tick's work is not complete before the next fires, subscriptions can queue up.

---

## 6. Shared Type Package — Single Source of Truth

**Pattern:** Contract-first design with a shared types package consumed by both backend and frontend.

**Package:** `packages/types` (imported as `@vantrade/types`)

```
src/
├── enums.ts                Role, OrderSide, TradeSignal, OrderStatus
├── interfaces/
│   ├── IBrokerAdapter.ts   Port interface + broker-related types
│   └── index.ts            JwtPayload, BlueprintParameters, MarketBarDto, ...
└── schemas/                Zod validation schemas (reused on both sides)
    ├── auth.schema.ts
    ├── blueprint.schema.ts
    ├── subscription.schema.ts
    ├── trade-log.schema.ts
    └── ...
```

Zod schemas are defined **once** and used:
- In **NestJS controllers** (`ZodValidationPipe`) to validate incoming request bodies.
- In the **web API client** (`base.ts`) to parse and validate API responses at runtime.

This eliminates duplicated type definitions and ensures both apps agree on the same contract.

**Trade-offs:**
- Breaking schema changes require coordinated updates to both apps; a schema field removal will cause a compile error in both `apps/api` and `apps/web` simultaneously.
- The package must be rebuilt and re-linked (`pnpm install`) before changes propagate to consumers.
- Zod runtime validation on every API response adds a small but non-zero overhead on every frontend request.

---

## 7. Typed API Client Layer (Frontend)

**Pattern:** Adapter pattern on the frontend — typed fetch wrappers isolate HTTP concerns from UI components.

**Directory:** `apps/web/src/lib/api-client/`

Every entity has its own client file:

| Client | File |
|---|---|
| Auth | `auth.client.ts` |
| Blueprints | `blueprints.client.ts` |
| Subscriptions | `subscriptions.client.ts` |
| API Keys | `api-keys.client.ts` |
| Market Data | `market-data.client.ts` |
| Trade Logs | `trade-logs.client.ts` |
| Users (admin) | `users.client.ts` |

All clients use a shared generic `apiClient` from `base.ts`:

```typescript
async function request<T>(
  path: string,
  options: RequestInit,
  token?: string,
  schema?: ZodType<T>,
): Promise<T>
```

- Attaches `Authorization: Bearer` header automatically.
- Parses responses through the corresponding Zod schema — any unexpected shape throws an error immediately.
- Raises `ApiError` with HTTP status code on non-2xx responses.

React pages import named client functions, not `fetch` directly. This means HTTP logic is in one place and pages contain only UI concerns.

---

## 8. Authentication & Authorization

**Pattern:** Stateless JWT authentication + declarative Role-Based Access Control (RBAC) with NestJS Guards.

### 8.1 Authentication

**Files:** `auth/jwt.strategy.ts`, `auth/jwt-auth.guard.ts`

- On login, the API signs a JWT containing `{ sub, email, role }` and returns it.
- The web app stores the token and passes it as `Authorization: Bearer <token>` on every request.
- `JwtStrategy` (Passport) validates the token and attaches the decoded payload to `req.user`.

### 8.2 Role-Based Access Control

**Files:** `auth/roles.guard.ts`, `auth/roles.decorator.ts`

```typescript
@Get('admin/all')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
findAll() { ... }
```

- `@Roles(Role.X)` attaches metadata to the route handler.
- `RolesGuard` reads `req.user.role` from the JWT payload and compares it to the required role.
- **Roles are never accepted from the request body** — registration always assigns `Role.TESTER`.

| Role | What they can do |
|---|---|
| `TESTER` | Browse verified blueprints, subscribe, manage API keys |
| `PROVIDER` | All TESTER permissions + create/edit/delete own blueprints |
| `ADMIN` | All permissions + verify blueprints, view all users and blueprints, assign user roles |

**Admin-only endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /blueprints/admin/all` | View all blueprints including unverified |
| `PATCH /blueprints/:id/verify` | Approve or revoke a blueprint |
| `GET /auth/users` | List all registered users |
| `PATCH /auth/users/:id/role` | Promote or demote a user's role |
| `GET /heartbeat/status` | Monitor the cron execution loop |

Role assignment is the mechanism that makes RBAC real end-to-end: new registrations always receive `Role.TESTER`, and only an admin can promote a user to `PROVIDER` or `ADMIN` via the API.

**Why it matters (business driver):** In a marketplace where Providers publish strategies that Testers execute with real broker accounts, privilege escalation is a direct financial risk — a malicious actor who could self-assign `PROVIDER` could publish harmful blueprints without admin review. Server-side RBAC removes this attack surface entirely: the client cannot influence its own role.

**Trade-offs:**
- JWTs are stateless and cannot be revoked before expiry; a role change (e.g., admin demoting a user) does not take effect until the affected user's token expires and they re-login.
- Storing the role in the JWT means a compromised token grants that role for its full lifetime, with no server-side kill switch.
- The `RolesGuard` performs a simple equality check; it does not support hierarchical roles (e.g., ADMIN inheriting PROVIDER permissions explicitly), so shared endpoints must list all permitted roles.

---

## 9. Security — Encrypted Credential Storage

**Pattern:** Encrypt-at-rest with in-memory-only decryption.

**File:** `apps/api/src/encryption/encryption.service.ts`

Broker API keys are sensitive and must never be stored in plaintext or appear in logs.

- **Algorithm:** AES-256-GCM (authenticated encryption — detects tampering)
- **Key derivation:** `scrypt` from the `ENCRYPTION_KEY` environment variable
- **Storage format:** `iv:authTag:ciphertext` (all hex) in the `ApiKey` table
- **Decryption:** Happens inside `HeartbeatService.processSub()`, in memory, immediately before the order is placed. The decrypted key is passed as a function argument — **never stored on the adapter instance**.

**Why it matters (business driver):** Users are trusting the platform with their live brokerage credentials. A database breach that exposed plaintext API keys would allow an attacker to place real trades on users' accounts. AES-256-GCM encryption ensures that even a full database dump reveals nothing usable — and the authenticated encryption detects any tampering with stored ciphertext before decryption is attempted.

**Trade-offs:**
- If the `ENCRYPTION_KEY` environment variable is lost or rotated without re-encrypting existing rows, all stored credentials become permanently inaccessible and users must re-enter their keys.
- `scrypt` key derivation adds a small startup cost and makes credential decryption slightly slower per call compared to a raw symmetric key.
- AES-256-GCM with a random IV means each encryption of the same key produces different ciphertext; deterministic searching across encrypted values is not possible.

---

## 10. Append-Only Audit Log

**Pattern:** Immutable event ledger.

**File:** `apps/api/src/trade-logs/trade-logs.repository.ts`

`TradeLog` rows are never updated or deleted. The repository exposes only:
- `create(data)` — insert a new record
- `findBySubscription(id)` — read records
- `findLatestTradeSideBySubscription(id)` — used to enforce trade alternation

This is enforced at the application layer: no `update` or `delete` methods exist on `TradeLogsRepository`. Any trade execution — including errors and HOLD signals — is logged, providing a complete, tamper-evident audit trail.

**Why it matters (business driver):** Users need to be able to independently verify their trade history and P&L. An audit trail that can be edited is no audit trail at all — it provides no protection against disputes or errors. The immutable log also enables the trade side alternation logic in the heartbeat: the system derives "what should happen next" solely from what is recorded, with no mutable state to go out of sync.

**Trade-offs:**
- Storage grows indefinitely; there is no archival or compaction mechanism for old trade logs.
- Queries that need the "current state" (e.g., last trade side) must derive it from the log via `findLatestTradeSideBySubscription`, adding a read on every heartbeat tick per active subscription.
- Errors and HOLD signals are also logged, which inflates row count relative to actual filled trades.

---

## 11. Validation Pipeline

**Pattern:** Parse, don't validate — schemas as the contract at every system boundary.

Every controller endpoint is protected by a `ZodValidationPipe`:

```typescript
@Post()
@UsePipes(new ZodValidationPipe(SubscriptionCreateSchema))
create(@Body() dto: SubscriptionCreateDto, @Req() req: AuthRequest) {
  return this.subscriptionsService.create(req.user.sub, dto);
}
```

Zod schemas are sourced from `@vantrade/types` (never duplicated), ensuring backend and frontend always validate against the same shape. On parse failure, the pipe throws `BadRequestException` with the Zod error details.

---

## 12. Testing Strategy

**Pattern:** Test pyramid — pure unit tests at the domain layer, integration-style mocks at the service layer.

### Domain Layer (Pure Functions)

**File:** `apps/api/src/trading/trading.engine.spec.ts`

No mocks needed. Tests call `calculateRSI`, `generateSignal`, `calculatePnL`, etc. directly with known inputs and verify outputs. Edge cases: insufficient data, all-gain/loss sequences, boundary RSI values.

### Service Layer (HeartbeatService)

**File:** `apps/api/src/heartbeat/heartbeat.service.spec.ts`

Uses `@nestjs/testing` `Test.createTestingModule()` with mocked repositories, broker adapter, and encryption service. Tests cover: market hours logic, timeframe alignment, RSI thresholds, alternation enforcement, error isolation per subscription, credential decryption flow.

### Frontend API Client

**File:** `apps/web/src/lib/api-client/base.spec.ts`

Tests the generic fetch wrapper: Zod schema validation on response, `ApiError` raised on non-2xx, 204 No Content handling, authorization header injection.

**Coverage target:** ≥ 80% line coverage on `apps/api/src/trading/`.

---

## 13. Architecture Quantum

An **architectural quantum** is the smallest independently deployable unit that includes all the structural elements required for it to function.

VanTrade is a **single quantum**: one NestJS API process, one PostgreSQL database, and one stateless Next.js frontend. All three must be deployed together for the system to function; there is no partial deployment path.

**Why single quantum is appropriate now:**
- The domain is small — five entities, three roles, one broker integration.
- The team is small; the operational overhead of multiple independently deployed services would outweigh the benefit.
- The shared type package (`@vantrade/types`) already enforces an explicit contract boundary between the API and web, making a future split straightforward.

**Migration path to multiple quanta:** The domain-partitioned modules make a future extraction tractable without a full rewrite. If the heartbeat execution engine needed to scale independently (e.g., hundreds of concurrent subscriptions saturating the API process), `HeartbeatModule` and `TradingModule` could be extracted into a dedicated worker service. The clean boundary points already exist: `IBrokerAdapter` is the broker interface, and `TradeLogsRepository` is the persistence interface — both would become inter-service contracts.

---

## 14. Structural Fitness Functions

Architecture governance rules are enforced through two complementary mechanisms.

### 14.1 Coverage Gate (Automated)

`jest --coverage` is configured to fail if line coverage on `apps/api/src/trading/` drops below 80%. This acts as a fitness function for the **testability** characteristic — ensuring the domain layer remains provably correct as it evolves.

### 14.2 Import Boundary Rules (Grep-Verifiable)

The following rules are documented as non-negotiable in `CLAUDE.md` and can be verified with one-line grep commands, making them suitable for a CI pre-merge check:

| Rule | Verification command |
|---|---|
| No Prisma outside `*.repository.ts` | `grep -r "PrismaService" --include="*.ts" \| grep -v ".repository.ts"` |
| No Alpaca SDK outside the adapter | `grep -r "alpaca-trade-api" --include="*.ts" \| grep -v "alpaca.adapter.ts"` |
| No `any` type | `grep -rn ": any" --include="*.ts"` |
| No business logic in web app | `grep -r "PrismaService\|IBrokerAdapter" apps/web --include="*.ts"` |

If any command returns output, the boundary has been violated. These checks require no additional tooling and can be wired into a CI pipeline as a shell step.

---

## Architecture Decision Summary

| Architecture Practice | Where Applied |
|---|---|
| Hexagonal / Ports & Adapters | `IBrokerAdapter` port + `AlpacaAdapter` + `trading.engine.ts` |
| Repository Pattern | One `*.repository.ts` per feature, sole Prisma access point |
| Layered Feature Modules | 10 NestJS modules (Controller → Service → Repository) |
| Thin Controller | Controllers: validate → call service → return |
| Shared Contract Package | `packages/types` — Zod schemas + interfaces used by both apps |
| Dependency Injection | NestJS DI container; `IBrokerAdapter` token for broker swap |
| Role-Based Access Control | `JwtAuthGuard` + `RolesGuard` + `@Roles()` decorator |
| Background Scheduling | `@Cron` heartbeat with `Promise.allSettled()` fault isolation |
| Encrypt-at-Rest | AES-256-GCM for broker credentials; decrypt in-memory only |
| Append-Only Ledger | `TradeLog` — no update/delete methods in repository |
| End-to-End Type Safety | TypeScript + Zod from DB schema to React component |
| Monorepo Orchestration | Turborepo build cache + pnpm workspaces |
| Single Architecture Quantum | One deployable unit; modules pre-partitioned for future extraction |
| Structural Fitness Functions | Coverage gate (80%) + grep-verifiable import boundary rules |
