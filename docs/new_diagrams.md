# VanTrade — Architecture Diagrams (Readable)

---

## 1. System Overview

```mermaid
graph LR
    Browser(["👤 Browser<br/>(Next.js 14)"])
    API["🖥️ NestJS API<br/>port 4000"]
    DB[("PostgreSQL")]
    Alpaca["📈 Alpaca<br/>Paper Trading"]
    Types["📦 @vantrade/types<br/>Shared Schemas"]

    Browser -->|"REST / JSON"| API
    API -->|"Prisma"| DB
    API -->|"SDK"| Alpaca
    Types -.->|"imported by"| Browser
    Types -.->|"imported by"| API
```

---

## 2. Hexagonal Architecture

```mermaid
graph TB
    subgraph Domain["🟢 Domain  (trading.engine.ts)"]
        D["Pure functions<br/>calculateRSI · generateSignal<br/>calculatePnL · ICT functions"]
    end

    subgraph Port["🟡 Port  (IBrokerAdapter)"]
        P["Interface contract<br/>getHistoricalPrices()<br/>placeOrderWithCredentials()"]
    end

    subgraph Adapter["🔵 Adapter  (alpaca.adapter.ts)"]
        A["Alpaca SDK<br/>Only file that touches the broker"]
    end

    Domain -->|"depends on"| Port
    Port -->|"implemented by"| Adapter
    HB["HeartbeatService"] -->|"calls via interface"| Port
```

---

## 3. Heartbeat Execution Flow

```mermaid
flowchart TD
    A([⏱️ Every 60 seconds]) --> B[Fetch all active subscriptions]
    B --> C{For each subscription<br/>Promise.allSettled}

    C --> D[Validate blueprint parameters]
    D --> E{Market open?}
    E -->|No| HOLD1([Log: HOLD — market closed])
    E -->|Yes| F[Fetch price bars from Alpaca]

    F --> G[Calculate RSI]
    G --> H{Signal?}

    H -->|HOLD| HOLD2([Log: HOLD])
    H -->|BUY or SELL| I{Matches expected<br/>alternation side?}

    I -->|No| SKIP([Log: HOLD — side skipped])
    I -->|Yes| J[Decrypt API key in memory]
    J --> K[Place order on Alpaca]
    K --> L([Log: BUY / SELL + PnL])
```

---

## 4. Database Schema

```mermaid
erDiagram
    USER {
        string  email
        string  password "hashed"
        enum    role     "TESTER · PROVIDER · ADMIN"
    }
    BLUEPRINT {
        string  title
        json    parameters
        boolean isVerified
    }
    SUBSCRIPTION {
        boolean isActive
        string  symbolOverride "optional — overrides blueprint asset"
    }
    API_KEY {
        string  encryptedKey
        string  encryptedSecret "AES-256-GCM"
        string  label
    }
    TRADE_LOG {
        enum     side       "buy · sell · hold"
        float    price
        float    pnl        "null on entry legs"
        datetime executedAt "append-only — no updatedAt"
    }

    USER ||--o{ BLUEPRINT    : "authors"
    USER ||--o{ SUBSCRIPTION : "has"
    USER ||--o{ API_KEY      : "owns"
    BLUEPRINT ||--o{ SUBSCRIPTION : "subscribed via"
    SUBSCRIPTION ||--o{ TRADE_LOG  : "generates"
```

---

## 5. Role & Permission Map

```mermaid
graph LR
    TESTER["👤 Tester"]
    PROVIDER["🏗️ Provider"]
    ADMIN["🔑 Admin"]

    subgraph Tester Actions
        T1["Subscribe / unsubscribe"]
        T2["Toggle subscription on/off"]
        T3["View trade logs & stats"]
        T4["Manage API keys"]
        T5["View open positions"]
    end

    subgraph Provider Actions
        P1["Create blueprints"]
        P2["Edit / delete own blueprints"]
        P3["Run backtests"]
    end

    subgraph Admin Actions
        A1["Verify / reject blueprints"]
        A2["View all users"]
        A3["Assign roles"]
        A4["Monitor heartbeat"]
    end

    TESTER --- T1 & T2 & T3 & T4 & T5
    PROVIDER --- T1 & T2 & T3 & T4 & T5
    PROVIDER --- P1 & P2 & P3
    ADMIN --- T1 & T2 & T3 & T4 & T5
    ADMIN --- P1 & P2 & P3
    ADMIN --- A1 & A2 & A3 & A4
```

---

## 6. Request Pipeline

```mermaid
flowchart LR
    R["HTTP Request"] --> C

    subgraph C["Controller"]
        C1["1. Validate input<br/>ZodValidationPipe"]
    end

    C --> S

    subgraph S["Service"]
        S1["2. Business logic<br/>no DB, no SDK"]
    end

    S --> Repo

    subgraph Repo["Repository"]
        R1["3. Prisma queries<br/>only file with DB access"]
    end

    Repo --> DB[("PostgreSQL")]
```

---

## 7. Credential Security Flow

```mermaid
sequenceDiagram
    participant Tester
    participant API
    participant EncryptionService
    participant Database
    participant Alpaca

    Tester->>API: POST /api-keys { key, secret }
    API->>EncryptionService: encrypt(key), encrypt(secret)
    EncryptionService-->>API: iv:authTag:ciphertext
    API->>Database: store encrypted blobs only

    Note over Alpaca: At order time (heartbeat)
    API->>Database: fetch encrypted key
    API->>EncryptionService: decrypt(blob)
    EncryptionService-->>API: credentials (in memory only)
    API->>Alpaca: placeOrder(credentials, order)
    Note over API: credentials discarded after call
```
