# VanTrade — Architecture Summary

## What It Is

VanTrade is a multi-tenant algorithmic trading marketplace. Strategy **Providers** publish parameterized trading Blueprints. Strategy **Testers** subscribe to Blueprints and the platform automatically executes them against their personal Alpaca paper trading accounts on a recurring schedule. **Admins** verify Blueprints before they appear in the marketplace.

The platform acts as secure middleware — it decouples strategy logic from brokerage execution so that users never need to run local infrastructure.

---

## Repository Layout

```
vantrade/
├── apps/
│   ├── api/          # NestJS — all business logic, REST API
│   └── web/          # Next.js 14 — UI only, calls NestJS API
├── packages/
│   └── types/        # Shared Zod schemas + TypeScript interfaces
├── prisma/
│   └── schema.prisma
└── turbo.json
```

Managed as a **pnpm monorepo** with **Turborepo** for parallel builds and caching. The shared `@vantrade/types` package is the contract between the two apps — type changes break both sides at compile time, not at runtime.

---

## Backend (`apps/api`) — NestJS

### Architectural Pattern: Hexagonal (Ports & Adapters)

The core principle: domain logic never imports infrastructure. Infrastructure is injected through interfaces.

```
┌─────────────────────────────────────────────┐
│                  Domain                      │
│   trading.engine.ts — pure functions only    │
│   calculateRSI / generateSignal / calculatePnL│
└─────────────┬───────────────────────────────┘
              │ depends on interface only
              ▼
┌─────────────────────────────────────────────┐
│              IBrokerAdapter (PORT)           │
│   getHistoricalPrices / placeOrder / ...     │
└─────────────┬───────────────────────────────┘
              │ implemented by
              ▼
┌─────────────────────────────────────────────┐
│          AlpacaAdapter (ADAPTER)             │
│   Alpaca Trade API SDK — only file that      │
│   imports the SDK                            │
└─────────────────────────────────────────────┘
```

To add a second broker (IBKR, Binance, etc.), write a new adapter implementing `IBrokerAdapter` and rebind the token in the NestJS module — zero changes to domain logic.

### Layer Responsibilities

| Layer | File | Rule |
|---|---|---|
| **Controller** | `*.controller.ts` | Parse request → validate with Zod → call one service method → return |
| **Service** | `*.service.ts` | Business logic, authorization checks, orchestration |
| **Repository** | `*.repository.ts` | **Only** file in each module that touches Prisma |
| **Engine** | `trading.engine.ts` | Pure functions, no side effects, no DI decorators |
| **Adapter** | `alpaca.adapter.ts` | **Only** file that imports the Alpaca SDK |

### Module Map

```
src/
├── auth/           — JWT strategy, guards, RBAC decorator
├── blueprints/     — Blueprint CRUD + admin verification
├── subscriptions/  — Tester subscription management
├── trade-logs/     — Append-only trade execution records
├── trading/
│   ├── trading.engine.ts     — RSI, SMA, signal logic (pure functions)
│   └── broker/
│       ├── IBrokerAdapter.ts — The port (re-exports from @vantrade/types)
│       └── alpaca.adapter.ts — The adapter
├── heartbeat/      — Autonomous cron execution loop
├── encryption/     — AES-256-GCM key vault
└── api-keys/       — Tester Alpaca key storage
```

### Validation

All controller inputs are validated with a `ZodValidationPipe` before the service is ever called. The same schemas in `@vantrade/types` validate both the NestJS API and the Next.js API client — single source of truth for the contract.

---

## The Heartbeat Loop

The heartbeat is the autonomous execution engine. It runs every 60 seconds via `@nestjs/schedule`.

```
Every 60 seconds:
  For each active Subscription (in parallel, isolated):
    1. Parse + validate Blueprint parameters (Zod)
    2. Decrypt user's Alpaca API key (AES-256-GCM)
    3. Fetch rsiPeriod + 1 historical price bars from Alpaca
    4. calculateRSI(prices, rsiPeriod)
    5. generateSignal(rsi, buyThreshold, sellThreshold) → BUY | SELL | HOLD
    6. If BUY or SELL: placeOrder(params, userCredentials)
    7. Write TradeLog record (regardless of signal)
    8. On any error: log + continue (never rethrows)
```

**Key invariant:** `placeOrder` always executes with the individual user's decrypted Alpaca credentials — never the platform's system account. Credentials are decrypted in-memory per tick and never persisted or logged.

---

## Data Model

```
User ──< Blueprint        (PROVIDER creates blueprints)
User ──< Subscription     (TESTER subscribes to blueprints)
User ──< ApiKey           (TESTER stores their Alpaca credentials)
Blueprint ──< Subscription
Subscription ──< TradeLog (append-only execution record)
```

```
User        { id, email, passwordHash, role[PROVIDER|TESTER|ADMIN] }
Blueprint   { id, title, description, parameters(JSON), isVerified, authorId }
Subscription{ id, isActive, userId, blueprintId }  @@unique([userId, blueprintId])
ApiKey      { id, encryptedKey, encryptedSecret, broker, userId }
TradeLog    { id, symbol, side, quantity, price, pnl, status, executedAt, subscriptionId }
```

`Blueprint.parameters` is a validated JSON column — the application enforces its shape via `BlueprintParametersSchema` (Zod) at read time.

---

## Security

| Concern | Implementation |
|---|---|
| Authentication | JWT in HttpOnly cookie (`sameSite: lax`) |
| Authorization | `JwtAuthGuard` + `RolesGuard` on every protected route |
| Role assignment | Registration always sets `Role.TESTER` — roles are not user-controlled |
| API key storage | AES-256-GCM encrypted before DB write, decrypted only at execution time |
| Input validation | Zod at every controller boundary |
| Audit trail | TradeLog is append-only — no UPDATE or DELETE |
| Secrets | All secrets via `process.env`, never hard-coded |

**RBAC matrix:**

| Action | PROVIDER | TESTER | ADMIN |
|---|---|---|---|
| Create / edit own Blueprint | ✅ | ❌ | ❌ |
| View marketplace | ✅ | ✅ | ✅ |
| Subscribe to Blueprint | ❌ | ✅ | ❌ |
| View own trade logs | ❌ | ✅ | ❌ |
| Verify / reject Blueprint | ❌ | ❌ | ✅ |

---

## Frontend (`apps/web`) — Next.js 14

- **App Router** for routing and page-level layout
- **No Route Handlers, no Server Actions** — all data goes through the NestJS REST API
- **No Prisma, no business logic** — UI only
- Typed API client in `lib/api-client/` uses the same Zod schemas from `@vantrade/types` to validate responses

---

## Known Limitations & Future Work

| Limitation | Impact | Recommended Solution |
|---|---|---|
| Single-process cron | ~100+ active subscriptions will saturate the event loop | Replace with BullMQ job queue (Redis-backed, with retries + rate limiting) |
| No JWT refresh tokens | 7-day tokens cannot be revoked after compromise | Short-lived access tokens (15 min) + rotating refresh tokens |
| PnL is always null | No position tracking across ticks | Track open positions; calculate realized PnL on matching SELL |
| Single strategy type | All blueprints run the same RSI logic | `Strategy` interface + `strategyType` enum on Blueprint |
| Hardcoded scrypt salt | Weakens key derivation uniformity | Random salt per key, or use a managed secrets vault (AWS KMS / Vault) |
| No key rotation | Compromised `ENCRYPTION_KEY` exposes all stored API keys | Version keys in vault; re-encryption migration path |
| Blueprint parameters schema drift | Old blueprints silently fail at execution time | Validate parameters at creation; add `strategyType` column |
