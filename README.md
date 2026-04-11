# VanTrade

A multi-tenant algorithmic trading strategy marketplace built as a pnpm monorepo with **NestJS** (API) and **Next.js 14** (web).

---

## Project Structure

```
vantrade/
├── apps/
│   ├── api/        # NestJS backend — all business logic, Prisma, Alpaca SDK
│   └── web/        # Next.js 14 frontend — UI only, calls NestJS REST API
├── packages/
│   └── types/      # Shared Zod schemas and TypeScript interfaces
├── prisma/
│   └── schema.prisma
└── turbo.json
```

---

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 — `npm install -g pnpm`
- **PostgreSQL** — local instance or a hosted provider (see below)

---

## Database options

### Option A — Local PostgreSQL

Install PostgreSQL locally and use a connection string like:

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

## Setup

### 1. Install dependencies
```bash
pnpm install
```

### 2. Configure environment variables

**API:**
```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — fill in DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET, ALPACA_API_KEY/SECRET
```

**Web:**
```bash
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local — set NEXT_PUBLIC_API_URL if needed (default: http://localhost:4000)
```

### 3. Run database migrations
```bash
pnpm --filter api prisma:migrate
```

### 4. Seed the database
```bash
pnpm --filter api prisma:seed
```

This creates three seed users:
| Email | Password | Role |
|---|---|---|
| admin@vantrade.io | Admin1234! | ADMIN |
| provider@vantrade.io | Provider1234! | PROVIDER |
| tester@vantrade.io | Tester1234! | TESTER |

---

## Running the apps

### Both apps simultaneously
```bash
pnpm dev
```

### API only (http://localhost:4000)
```bash
pnpm --filter api dev
```

### Web only (http://localhost:3000)
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
```

---

## Key Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a new user |
| POST | `/api/auth/login` | Public | Login, receive JWT |
| GET | `/api/blueprints` | Public | List verified blueprints |
| POST | `/api/blueprints` | PROVIDER | Create a blueprint |
| PATCH | `/api/blueprints/:id/verify` | ADMIN | Verify a blueprint |
| GET | `/api/subscriptions` | TESTER | List my subscriptions |
| POST | `/api/subscriptions` | TESTER | Subscribe to a blueprint |
| POST | `/api/api-keys` | TESTER | Store Alpaca API key |

---

## Architecture

See [AGENTS.md](AGENTS.md) for full architecture documentation including:
- Hexagonal architecture patterns (Ports & Adapters)
- Repository pattern
- RBAC enforcement
- Heartbeat cron execution loop
- AES-256-GCM key encryption