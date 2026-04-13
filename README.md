# VanTrade

A multi-tenant algorithmic trading strategy marketplace built as a pnpm monorepo with **NestJS** (API) and **Next.js 14** (web).

Strategy **Providers** publish parameterized RSI-based Blueprints. **Testers** subscribe and execute them automatically against their personal Alpaca Paper Trading accounts. **Admins** verify Blueprints before they appear on the marketplace.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **API** | NestJS 10, TypeScript 5 |
| **Web** | Next.js 14, React 18, Tailwind CSS |
| **Database** | PostgreSQL (via Prisma 5 ORM) |
| **Auth** | JWT (Passport.js), bcryptjs |
| **Broker** | Alpaca Paper Trading API |
| **Validation** | Zod (shared `@vantrade/types` package) |
| **Encryption** | AES-256-GCM (Node.js `crypto`) |
| **Build** | pnpm workspaces, Turborepo |
| **Testing** | Jest, ts-jest, Supertest |
| **Rate Limiting** | `@nestjs/throttler` |
| **Scheduling** | `@nestjs/schedule` (cron) |

---

## User Roles & Permissions

| Role | Responsibilities | Permitted Operations |
|---|---|---|
| **TESTER** | Subscribes to Blueprints and executes them against their own Alpaca paper account | Browse marketplace · Subscribe/unsubscribe · Toggle subscription active state · Store & manage Alpaca API keys · View own trade logs & P&L stats · View open positions |
| **PROVIDER** | Publishes parameterized trading Blueprints for Testers to use | All TESTER permissions · Create / edit / delete own Blueprints · Run dry-run previews · Run backtests |
| **ADMIN** | Governs the marketplace and audits activity | All PROVIDER permissions · Verify / reject any Blueprint · View all users and all Blueprints |

> **Registration** always assigns `TESTER`. Role upgrades are performed by an Admin only — role is never accepted from the request body.

---

## System Architecture Overview

VanTrade enforces **Hexagonal Architecture (Ports & Adapters)** in the trading subsystem and the **Repository Pattern** for database access throughout.

```
┌─────────────────────────────────────────────────────────┐
│                    apps/web  (Next.js)                  │
│   Pages → api-client/ fetch wrappers → NestJS REST API  │
└─────────────────────────────────────────────────────────┘
                           │ HTTP / JSON
┌─────────────────────────────────────────────────────────┐
│                    apps/api  (NestJS)                   │
│                                                         │
│  Controller → Service → Repository → PrismaService      │
│                  │                                      │
│           HeartbeatService  (cron, every 60s)           │
│                  │                                      │
│    Domain: trading.engine.ts (pure functions)           │
│    Port:   IBrokerAdapter  (interface)                  │
│    Adapter: AlpacaAdapter  (only Alpaca SDK importer)   │
└─────────────────────────────────────────────────────────┘
                           │
                    PostgreSQL (Prisma)
```

Key architectural patterns:

- **Hexagonal (Ports & Adapters):** `trading.engine.ts` is pure functions only. `IBrokerAdapter` is the port. `AlpacaAdapter` is the only file that imports the Alpaca SDK. Swap brokers by writing one new file.
- **Repository Pattern:** One `*.repository.ts` per feature — the only files allowed to use `PrismaService`.
- **Thin Controllers:** Controllers do exactly three things — validate with `ZodValidationPipe`, call one service method, return the result.
- **Append-Only Trade Ledger:** `TradeLog` rows are never updated or deleted — immutable audit trail.
- **AES-256-GCM Credential Encryption:** Broker API keys are encrypted at rest. Decrypted values are computed in-memory at order time only.

See [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md) for a full architectural write-up.

---

## Project Structure

```
vantrade/
├── apps/
│   ├── api/        # NestJS backend — all business logic, Prisma, Alpaca SDK
│   └── web/        # Next.js 14 frontend — UI only, calls NestJS REST API
├── packages/
│   └── types/      # Shared Zod schemas and TypeScript interfaces (@vantrade/types)
├── docs/           # Architecture report, SRS, risk assessment
└── turbo.json
```

---

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 — `npm install -g pnpm`
- **PostgreSQL** — local instance or a hosted provider (see below)

---

## Database Setup

### Option A — Local PostgreSQL

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/vantrade"
```

### Option B — Supabase (recommended for quick setup)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database → Connection string** and copy the **direct URI** (port `5432`, not the pooler)
3. Use it as your `DATABASE_URL`:

```
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
```

> **Important:** always use the direct connection (port `5432`) for `prisma:migrate`. The pooler URL (port `6543`) will cause the migration command to hang.

---

## Installation & Setup

### 1. Install dependencies
```bash
pnpm install
```

### 2. Configure environment variables

**API (`apps/api/.env`):**
```bash
cp apps/api/.env.example apps/api/.env
# Fill in: DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET, ALPACA_API_KEY, ALPACA_API_SECRET
# Optional: WEB_URL, PORT (default 4000), MARKET_TIMEZONE (default America/New_York)
```

**Web (`apps/web/.env.local`):**
```bash
cp apps/web/.env.local.example apps/web/.env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Run database migrations
```bash
pnpm --filter api prisma:migrate
```

### 4. Seed the database
```bash
pnpm --filter api prisma:seed
```

Seed users:

| Email | Password | Role |
|---|---|---|
| admin@vantrade.io | Admin1234! | ADMIN |
| provider@vantrade.io | Provider1234! | PROVIDER |
| tester@vantrade.io | Tester1234! | TESTER |

---

## Running the System

### Both apps simultaneously
```bash
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:3000

### API only
```bash
pnpm --filter api dev
```

### Web only
```bash
pnpm --filter web dev
```

---

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage (target ≥ 80% on apps/api/src/trading/)
pnpm test:coverage

# API tests only
pnpm --filter api test

# Web tests only
pnpm --filter web test
```

---

## Key API Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a new user (always TESTER) |
| POST | `/api/auth/login` | Public | Login, receive JWT |
| GET | `/api/blueprints` | Public | List verified blueprints |
| POST | `/api/blueprints` | PROVIDER | Create a blueprint |
| GET | `/api/blueprints/:id/backtest` | PROVIDER | Backtest a blueprint |
| PATCH | `/api/blueprints/:id/verify` | ADMIN | Verify a blueprint |
| GET | `/api/subscriptions` | TESTER | List my subscriptions |
| POST | `/api/subscriptions` | TESTER | Subscribe to a blueprint |
| GET | `/api/subscriptions/:id/stats` | TESTER | Trade stats for a subscription |
| POST | `/api/api-keys` | TESTER | Store Alpaca API key |
| GET | `/api/api-keys` | TESTER | List stored API keys |
| GET | `/api/positions` | TESTER | View open positions |
| GET | `/api/market-data/bars` | TESTER | Fetch OHLCV bars |

---

## Screenshots

### Login
![Login](docs/screenshots/login.png)

### Marketplace (Blueprint Listing)
![Marketplace](docs/screenshots/marketplace.png)

### Blueprint Detail & Backtest
![Backtest](docs/screenshots/backtest.png)

### Tester Dashboard — Active Subscriptions
![Dashboard](docs/screenshots/dashboard.png)

### Trade Logs
![Trade Logs](docs/screenshots/trade-logs.png)

### Admin — Blueprint Verification
![Admin](docs/screenshots/admin.png)
