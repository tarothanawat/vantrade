# VanTrade — Architecture Diagrams (Mermaid)

Use these in any Mermaid-compatible renderer (GitHub, Notion, VS Code extension, etc.).

---

## 1. Monorepo Architecture

```mermaid
graph TD
    subgraph REPO["pnpm workspaces + Turborepo"]
        API["apps/api<br/>NestJS REST API<br/>port 4000"]
        WEB["apps/web<br/>Next.js 14 UI<br/>port 3000"]
        TYPES["packages/types<br/>Shared Zod schemas + TypeScript interfaces<br/>@vantrade/types"]
    end

    API -- "imports" --> TYPES
    WEB -- "imports" --> TYPES
    WEB -- "HTTP REST" --> API
    API --> DB[(PostgreSQL)]

    style REPO fill:#1E293B,stroke:#334155,color:#F8FAFC
    style API fill:#6366F1,stroke:#6366F1,color:#fff
    style WEB fill:#6366F1,stroke:#6366F1,color:#fff
    style TYPES fill:#F59E0B,stroke:#F59E0B,color:#000
    style DB fill:#1E293B,stroke:#334155,color:#94A3B8
```

---

## 2. Hexagonal Architecture (Ports & Adapters)

```mermaid
graph TD
    DOMAIN["DOMAIN — trading.engine.ts<br/>calculateRSI · generateSignal · calculatePnL · ICT functions<br/>Pure functions — zero infrastructure imports"]
    PORT["PORT — IBrokerAdapter<br/>packages/types/src/interfaces/IBrokerAdapter.ts<br/>getHistoricalPrices · placeOrderWithCredentials"]
    ADAPTER["ADAPTER — alpaca.adapter.ts<br/>Only file that imports the Alpaca SDK"]

    DOMAIN -- "depends on" --> PORT
    PORT -- "implemented by" --> ADAPTER

    style DOMAIN fill:#059669,stroke:#059669,color:#fff
    style PORT fill:#F59E0B,stroke:#F59E0B,color:#000
    style ADAPTER fill:#6366F1,stroke:#6366F1,color:#fff
```

---

## 3. Heartbeat Execution Pipeline

```mermaid
sequenceDiagram
    participant CRON as Cron (60s)
    participant HB as HeartbeatService
    participant SR as SubscriptionsRepository
    participant ENC as EncryptionService
    participant BA as IBrokerAdapter (AlpacaAdapter)
    participant TE as trading.engine.ts
    participant TL as TradeLogsRepository

    CRON->>HB: tick()
    HB->>SR: findAllActive()
    SR-->>HB: subscriptions[]

    loop Promise.allSettled — per subscription
        HB->>ENC: decrypt(apiKey)
        ENC-->>HB: BrokerCredentials (in-memory only)
        HB->>BA: getHistoricalPrices(symbol, bars)
        BA-->>HB: OHLCV bars[]
        HB->>TE: calculateRSI(prices)
        TE-->>HB: rsi value
        HB->>TE: generateSignal(rsi, thresholds)
        TE-->>HB: BUY | SELL | HOLD
        alt signal is BUY or SELL
            HB->>BA: placeOrderWithCredentials(credentials, order)
            BA-->>HB: OrderResult
        end
        HB->>TL: create(tradeLog)
    end
```

---

## 4. Database ER Diagram

```mermaid
erDiagram
    USER {
        string id PK
        string email
        string password
        enum role "TESTER or PROVIDER or ADMIN"
    }
    BLUEPRINT {
        string id PK
        string title
        string description
        json parameters
        boolean isVerified
        string authorId FK
    }
    SUBSCRIPTION {
        string id PK
        boolean isActive
        string symbolOverride "nullable"
        string userId FK
        string blueprintId FK
    }
    API_KEY {
        string id PK
        string encryptedKey
        string encryptedSecret
        string label
        string userId FK
    }
    TRADE_LOG {
        string id PK
        string symbol
        enum side "buy or sell or hold"
        float price
        float quantity
        float pnl "nullable"
        string status
        datetime executedAt
        string subscriptionId FK
    }

    USER ||--o{ BLUEPRINT : "authors"
    USER ||--o{ SUBSCRIPTION : "has"
    USER ||--o{ API_KEY : "owns"
    BLUEPRINT ||--o{ SUBSCRIPTION : "subscribed by"
    SUBSCRIPTION ||--o{ TRADE_LOG : "generates (append-only)"
```

---

## 5. Request Pipeline — Layered Slice

```mermaid
graph TD
    REQ["HTTP Request"]
    CTRL["Controller<br/>validate input with ZodValidationPipe<br/>call one service method · return result"]
    SVC["Service<br/>business logic and orchestration<br/>no Prisma, no SDK"]
    REPO["Repository<br/>Prisma queries only<br/>only file that imports PrismaService"]
    DB[(PostgreSQL)]

    REQ --> CTRL
    CTRL --> SVC
    SVC --> REPO
    REPO --> DB

    style REQ fill:#334155,stroke:#334155,color:#F8FAFC
    style CTRL fill:#6366F1,stroke:#6366F1,color:#fff
    style SVC fill:#1E293B,stroke:#6366F1,color:#F8FAFC
    style REPO fill:#1E293B,stroke:#F59E0B,color:#F8FAFC
    style DB fill:#1E293B,stroke:#334155,color:#94A3B8
```
