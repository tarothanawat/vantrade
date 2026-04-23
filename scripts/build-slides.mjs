/**
 * VanTrade — PPTX Presentation Generator
 * Run: node scripts/build-slides.mjs
 * Output: docs/VanTrade-Presentation.pptx
 */

import pptxgen from 'pptxgenjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../docs/VanTrade-Presentation.pptx');

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg: '0F172A',       // slate-900
  surface: '1E293B',  // slate-800
  border: '334155',   // slate-700
  indigo: '6366F1',   // indigo-500
  gold: 'F59E0B',     // amber-500
  green: '059669',    // emerald-600
  red: 'EF4444',      // red-500
  white: 'F8FAFC',    // slate-50
  muted: '94A3B8',    // slate-400
  font: 'Calibri',
};

// Slide dimensions (widescreen 13.33 x 7.5 inches)
const W = 13.33;
const H = 7.5;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.defineLayout({ name: 'LAYOUT_WIDE', width: W, height: H });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Add a new slide with dark background */
function newSlide() {
  const slide = pres.addSlide();
  slide.background = { color: T.bg };
  return slide;
}

/** Indigo accent bar at the top of every content slide */
function addTopBar(slide) {
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: W, h: 0.06,
    fill: { color: T.indigo },
    line: { color: T.indigo },
  });
}

/** Section label (small uppercase, muted) */
function addSection(slide, text, y = 0.12) {
  slide.addText(text.toUpperCase(), {
    x: 0.45, y, w: W - 0.9, h: 0.28,
    fontSize: 9,
    color: T.indigo,
    fontFace: T.font,
    bold: true,
    charSpacing: 2,
  });
}

/** Main headline */
function addHeadline(slide, text, y = 0.42, color = T.white) {
  slide.addText(text, {
    x: 0.45, y, w: W - 0.9, h: 0.55,
    fontSize: 26,
    color,
    fontFace: T.font,
    bold: true,
  });
}

/** Subtitle / body text */
function addSubtitle(slide, text, x = 0.45, y = 0.95, w = W - 0.9, h = 0.4, size = 14, color = T.muted) {
  slide.addText(text, {
    x, y, w, h,
    fontSize: size,
    color,
    fontFace: T.font,
  });
}

/** Bullet list */
function addBullets(slide, items, x, y, w, h, size = 13, color = T.white, bulletColor = T.indigo) {
  const rows = items.map((item) => ({
    text: item,
    options: { bullet: { color: bulletColor }, fontSize: size, color, fontFace: T.font, paraSpaceAfter: 4 },
  }));
  slide.addText(rows, { x, y, w, h });
}

/** Thin horizontal divider */
function addDivider(slide, y, color = T.border) {
  slide.addShape(pres.ShapeType.line, {
    x: 0.45, y, w: W - 0.9, h: 0,
    line: { color, width: 0.75 },
  });
}

/** Filled rounded-rect box with text */
function addBox(slide, text, x, y, w, h, fillColor = T.surface, textColor = T.white, fontSize = 12, bold = false) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fillColor },
    line: { color: T.border, width: 0.75 },
    rectRadius: 0.05,
  });
  slide.addText(text, {
    x: x + 0.06, y: y + 0.04, w: w - 0.12, h: h - 0.08,
    fontSize,
    color: textColor,
    fontFace: T.font,
    bold,
    align: 'center',
    valign: 'middle',
  });
}

/** Downward connector arrow between two boxes */
function addArrowDown(slide, centerX, fromY, toY) {
  const midY = (fromY + toY) / 2;
  slide.addShape(pres.ShapeType.line, {
    x: centerX, y: fromY, w: 0, h: toY - fromY,
    line: { color: T.border, width: 1.5, endArrowType: 'arrow' },
  });
  void midY; // suppress unused warning
}

/** Simple table */
function addTable(slide, rows, x, y, w, colW, headerFill = T.indigo, rowFill = T.surface, textSize = 11) {
  const tableRows = rows.map((row, i) =>
    row.map((cell) => ({
      text: cell,
      options: {
        fill: { color: i === 0 ? headerFill : rowFill },
        color: i === 0 ? T.white : T.white,
        fontSize: textSize,
        fontFace: T.font,
        bold: i === 0,
        border: { type: 'solid', color: T.border, pt: 0.5 },
        margin: [4, 6, 4, 6],
        valign: 'middle',
      },
    }))
  );
  slide.addTable(tableRows, {
    x, y, w,
    colW,
    border: { type: 'solid', color: T.border, pt: 0.5 },
    autoPage: false,
    rowH: 0.38,
  });
}

// ─── Slide 0 — Title ──────────────────────────────────────────────────────────
{
  const slide = newSlide();

  // Indigo gradient-style bar left side
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.5, h: H,
    fill: { color: T.indigo },
    line: { color: T.indigo },
  });

  // Gold accent bottom strip
  slide.addShape(pres.ShapeType.rect, {
    x: 0.5, y: H - 0.12, w: W - 0.5, h: 0.12,
    fill: { color: T.gold },
    line: { color: T.gold },
  });

  // VanTrade title
  slide.addText('VanTrade', {
    x: 1.1, y: 2.2, w: 10, h: 1.4,
    fontSize: 60,
    bold: true,
    color: T.white,
    fontFace: T.font,
  });

  // Subtitle
  slide.addText('A marketplace for algo trading strategies', {
    x: 1.1, y: 3.55, w: 10, h: 0.6,
    fontSize: 22,
    color: T.indigo,
    fontFace: T.font,
    italic: true,
  });

  // Divider
  slide.addShape(pres.ShapeType.line, {
    x: 1.1, y: 4.25, w: 9, h: 0,
    line: { color: T.border, width: 1 },
  });

  // Team / Course
  slide.addText('tarothanawat  ·  Software Architecture  ·  April 2026', {
    x: 1.1, y: 4.45, w: 10, h: 0.4,
    fontSize: 13,
    color: T.muted,
    fontFace: T.font,
  });
}

// ─── Slide 1 — 3.1 What is VanTrade? ─────────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.1 — What is VanTrade?');
  addHeadline(slide, '"Let traders share strategies —\nwithout sharing code or credentials"', 0.42, T.white);

  // 3 role cards
  const cards = [
    { label: 'Provider', icon: '✍', desc: 'Writes & publishes\ntrading strategies' },
    { label: 'Tester', icon: '▶', desc: 'Subscribes & runs\nthem on a paper account' },
    { label: 'Admin', icon: '✔', desc: 'Reviews strategies\nbefore they go live' },
  ];
  const cardW = 3.4;
  const gap = 0.35;
  const startX = (W - (cardW * 3 + gap * 2)) / 2;
  const cardY = 2.15;

  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gap);
    // Card background
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: cardY, w: cardW, h: 2.8,
      fill: { color: T.surface },
      line: { color: i === 0 ? T.indigo : i === 1 ? T.green : T.gold, width: 1.5 },
      rectRadius: 0.08,
    });
    // Icon
    slide.addText(c.icon, {
      x, y: cardY + 0.25, w: cardW, h: 0.65,
      fontSize: 28,
      color: i === 0 ? T.indigo : i === 1 ? T.green : T.gold,
      fontFace: T.font,
      align: 'center',
      valign: 'middle',
    });
    // Role name
    slide.addText(c.label, {
      x, y: cardY + 0.95, w: cardW, h: 0.45,
      fontSize: 18,
      color: T.white,
      fontFace: T.font,
      bold: true,
      align: 'center',
    });
    // Description
    slide.addText(c.desc, {
      x: x + 0.15, y: cardY + 1.5, w: cardW - 0.3, h: 0.9,
      fontSize: 12,
      color: T.muted,
      fontFace: T.font,
      align: 'center',
    });
  });

  // Footer note
  slide.addText('Paper trading only  ·  Alpaca API  ·  No real money', {
    x: 0.45, y: 5.2, w: W - 0.9, h: 0.35,
    fontSize: 11,
    color: T.muted,
    fontFace: T.font,
    align: 'center',
    italic: true,
  });
}

// ─── Slide 2 — 3.2 Architecture Characteristics ───────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.2 — Architecture Characteristics');
  addHeadline(slide, 'Five things we cared about most');
  addDivider(slide, 1.05);

  const rows = [
    ['Attribute', 'Why it matters for VanTrade'],
    ['🔐  Security', 'Users hand us their live broker keys — a breach exposes real accounts'],
    ['⚡  Reliability', "One bad user's credentials must never block another user's trade"],
    ['📋  Auditability', 'Trade history must be tamper-proof and independently verifiable'],
    ['🔧  Maintainability', 'Swap brokers without ever touching strategy calculation code'],
    ['🧪  Testability', 'Financial math must be provably correct — not inferred from live runs'],
  ];

  addTable(slide, rows,
    0.45, 1.18, W - 0.9,
    [3.0, W - 0.9 - 3.0],
    T.indigo, T.surface, 12
  );
}

// ─── Slide 3 — 3.3 System Architecture ───────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.3 — System Architecture');
  addHeadline(slide, 'One deployable unit, clean internal boundaries');

  // Outer monorepo box
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.45, y: 1.15, w: 7.5, h: 4.55,
    fill: { color: T.surface },
    line: { color: T.border, width: 1 },
    rectRadius: 0.08,
  });
  slide.addText('pnpm workspaces + Turborepo', {
    x: 0.55, y: 1.2, w: 7.3, h: 0.35,
    fontSize: 11,
    color: T.muted,
    fontFace: T.font,
    bold: true,
    align: 'center',
  });

  // apps/api box
  addBox(slide, 'apps/api\nNestJS REST API\nport 4000', 0.75, 1.75, 3.2, 1.4, T.indigo, T.white, 12, true);

  // apps/web box
  addBox(slide, 'apps/web\nNext.js 14 UI\nport 3000', 4.2, 1.75, 3.2, 1.4, T.indigo, T.white, 12, true);

  // packages/types bar
  addBox(slide, 'packages/types  ·  Shared Zod schemas + TypeScript interfaces  ·  @vantrade/types',
    0.75, 3.45, 6.65, 0.65, T.gold, '000000', 11, true);

  // Arrow down
  addArrowDown(slide, 4.07, 4.18, 4.85);

  // PostgreSQL
  addBox(slide, '🐘  PostgreSQL', 3.07, 4.9, 2.0, 0.55, T.surface, T.muted, 12, false);

  // Right-side bullets
  addSection(slide, 'Key points', 1.3);
  addBullets(slide, [
    'Single architectural quantum',
    '10 NestJS domain modules',
    'shared Zod schemas = compile-time contract',
    'Web talks to API via REST only',
  ], 8.2, 1.5, 4.7, 3.5, 13, T.white, T.indigo);
}

// ─── Slide 4 — 3.3 Hexagonal Architecture ────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.3 — Hexagonal Architecture (Ports & Adapters)');
  addHeadline(slide, 'Trading logic isolated behind a clean interface');

  const boxW = 5.8;
  const boxH = 1.2;
  const cx = (W - boxW) / 2 - 0.5;
  const gap = 0.3;

  // Domain
  const y1 = 1.55;
  addBox(slide, 'DOMAIN  ·  trading.engine.ts\ncalculateRSI · generateSignal · calculatePnL · ICT functions\nPure functions — zero infrastructure imports',
    cx, y1, boxW, boxH, T.green, T.white, 12, false);

  // Arrow
  addArrowDown(slide, cx + boxW / 2, y1 + boxH, y1 + boxH + gap);

  // Port
  const y2 = y1 + boxH + gap;
  addBox(slide, 'PORT  ·  IBrokerAdapter  (packages/types)\ngetHistoricalPrices()  ·  placeOrderWithCredentials()\nContract — HeartbeatService depends on this, not the adapter',
    cx, y2, boxW, boxH, T.gold, '000000', 12, false);

  // Arrow
  addArrowDown(slide, cx + boxW / 2, y2 + boxH, y2 + boxH + gap);

  // Adapter
  const y3 = y2 + boxH + gap;
  addBox(slide, 'ADAPTER  ·  alpaca.adapter.ts\nOnly file that imports the Alpaca SDK\nImplements IBrokerAdapter — injected via DI token',
    cx, y3, boxW, boxH, T.indigo, T.white, 12, false);

  // Callout
  slide.addShape(pres.ShapeType.roundRect, {
    x: cx + boxW + 0.35, y: y1 + 0.5, w: 4.0, h: 0.7,
    fill: { color: T.surface },
    line: { color: T.gold, width: 1.5 },
    rectRadius: 0.06,
  });
  slide.addText('Swap broker = 1 new adapter file,\n0 changes to domain or heartbeat logic', {
    x: cx + boxW + 0.5, y: y1 + 0.5, w: 3.7, h: 0.7,
    fontSize: 12,
    color: T.gold,
    fontFace: T.font,
    bold: true,
    valign: 'middle',
  });
}

// ─── Slide 5 — 3.4 Requirements Traceability ─────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.4 — Why This Architecture?');
  addHeadline(slide, 'Every decision maps back to a requirement');
  addDivider(slide, 1.05);

  const rows = [
    ['Characteristic', 'What We Built', 'Why It Works'],
    ['🔐  Security', 'AES-256-GCM encryption + RBAC Guards', 'Keys never stored plaintext; client can\'t escalate role'],
    ['⚡  Reliability', 'Promise.allSettled in HeartbeatService', 'One failure is isolated — others keep running'],
    ['📋  Auditability', 'Append-only TradeLog (no update/delete)', 'Schema itself prevents tampering; history is immutable'],
    ['🔧  Maintainability', 'IBrokerAdapter port (DI token)', 'Swap broker by writing 1 file + rebinding 1 DI token'],
    ['🧪  Testability', 'Pure domain functions (no mocks needed)', 'Test with plain inputs; no DB or network required'],
  ];

  addTable(slide, rows,
    0.45, 1.18, W - 0.9,
    [2.5, 3.8, W - 0.9 - 2.5 - 3.8],
    T.indigo, T.surface, 11
  );
}

// ─── Slide 6 — 3.5 Separation of Concerns ────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.5 — Code Quality: Separation of Concerns');
  addHeadline(slide, 'Each layer has exactly one job');

  // Layer diagram
  const lx = 0.55;
  const lw = 5.8;
  const lh = 1.05;
  const lgap = 0.2;

  // HTTP request label
  slide.addText('HTTP Request  ↓', {
    x: lx, y: 1.45, w: lw, h: 0.35,
    fontSize: 12,
    color: T.muted,
    fontFace: T.font,
    align: 'center',
  });

  const layers = [
    { label: 'Controller', sub: 'validate with ZodValidationPipe → call service → return', fill: T.indigo },
    { label: 'Service', sub: 'business logic + orchestration  (no Prisma, no SDK)', fill: '4338CA' },
    { label: 'Repository', sub: 'Prisma queries only  (only file that imports PrismaService)', fill: T.gold, text: '000000' },
  ];

  layers.forEach((l, i) => {
    const y = 1.85 + i * (lh + lgap);
    addBox(slide, `${l.label}\n${l.sub}`, lx, y, lw, lh, l.fill, l.text ?? T.white, 12, false);
    if (i < layers.length - 1) {
      addArrowDown(slide, lx + lw / 2, y + lh, y + lh + lgap);
    }
  });

  // Right bullets
  addSection(slide, 'Rules enforced', 1.5);
  addBullets(slide, [
    'Thin Controller Rule — controllers do exactly 3 things',
    'Repository Pattern — Prisma in one place only',
    'Zod at every boundary — API in, web out, same schema',
    'Architecture Sinkhole anti-pattern avoided by design',
  ], 6.65, 1.75, 6.3, 3.2, 13, T.white, T.indigo);
}

// ─── Slide 7 — 3.5 Security & Fitness Functions ───────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.5 — Code Quality: Security & Fitness Functions');
  addHeadline(slide, 'We enforce rules with code, not discipline');
  addDivider(slide, 1.05);

  // Two columns
  const col1x = 0.45;
  const col2x = 6.8;
  const colW = 5.9;

  slide.addText('Security Practices', {
    x: col1x, y: 1.15, w: colW, h: 0.38,
    fontSize: 14,
    color: T.indigo,
    fontFace: T.font,
    bold: true,
  });
  addBullets(slide, [
    'Role comes from JWT — client can\'t self-promote',
    'Credentials encrypted at rest (AES-256-GCM)',
    'scrypt key derivation from env var',
    'Rate limiting: 10 req/s burst, 200 req/min sustained',
    'No any types — TypeScript strict mode everywhere',
  ], col1x, 1.6, colW, 3.4, 13, T.white, T.indigo);

  // Vertical divider
  slide.addShape(pres.ShapeType.line, {
    x: 6.65, y: 1.15, w: 0, h: 4.0,
    line: { color: T.border, width: 0.75 },
  });

  slide.addText('Fitness Functions (automated)', {
    x: col2x, y: 1.15, w: colW, h: 0.38,
    fontSize: 14,
    color: T.gold,
    fontFace: T.font,
    bold: true,
  });
  addBullets(slide, [
    'No Prisma outside *.repository.ts  (grep CI)',
    'No Alpaca SDK outside alpaca.adapter.ts  (grep CI)',
    'No business logic in apps/web  (grep CI)',
    'No any type  (grep CI)',
    '80% line coverage gate on apps/api/src/trading/',
  ], col2x, 1.6, colW, 3.4, 13, T.white, T.gold);
}

// ─── Slide 8 — 3.6 Module Map ─────────────────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.6 — Code Structure: Module Map');
  addHeadline(slide, '10 modules — each owns its own slice');
  addDivider(slide, 1.05);

  const rows = [
    ['Module', 'Ctrl', 'Svc', 'Repo', 'Key Responsibility'],
    ['AuthModule', '✓', '✓', '✓', 'JWT auth, user management'],
    ['BlueprintsModule', '✓', '✓', '✓', 'Marketplace CRUD, admin gate, backtest'],
    ['SubscriptionsModule', '✓', '✓', '✓', 'Subscribe / toggle / unsubscribe'],
    ['ApiKeysModule', '✓', '✓', '✓', 'Encrypted broker credentials'],
    ['HeartbeatModule', '✓', '✓', '—', 'Cron execution engine (every 60s)'],
    ['TradingModule', '—', '—', '—', 'Exports IBrokerAdapter DI token'],
    ['EncryptionModule', '—', '✓', '—', 'AES-256-GCM encrypt / decrypt'],
    ['MarketDataModule', '✓', '✓', '—', 'Live price endpoint for UI'],
    ['TradeLogsModule', '—', '—', '✓', 'Append-only trade ledger'],
    ['PrismaModule', '—', '—', '—', '@Global() DB connection'],
  ];

  addTable(slide, rows,
    0.45, 1.18, W - 0.9,
    [2.8, 0.7, 0.7, 0.7, W - 0.9 - 2.8 - 0.7 - 0.7 - 0.7],
    T.indigo, T.surface, 11
  );
}

// ─── Slide 9 — 3.6 Database Schema ────────────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.6 — Code Structure: Database Design');
  addHeadline(slide, 'Five tables — trade history is append-only');

  // ER chain
  const bw = 2.0;
  const bh = 0.75;
  const by = 2.0;
  const gap = 0.55;
  const total = 4 * bw + 3 * gap;
  const startX = (W - total) / 2;

  const entities = ['User', 'Blueprint', 'Subscription', 'TradeLog ★'];
  const colors = [T.indigo, '4338CA', '7C3AED', T.green];

  entities.forEach((e, i) => {
    const x = startX + i * (bw + gap);
    addBox(slide, e, x, by, bw, bh, colors[i], T.white, 13, true);
    if (i < entities.length - 1) {
      // Horizontal arrow
      slide.addShape(pres.ShapeType.line, {
        x: x + bw, y: by + bh / 2, w: gap, h: 0,
        line: { color: T.border, width: 1.5, endArrowType: 'arrow' },
      });
    }
  });

  // ApiKey branch
  const userX = startX;
  addBox(slide, 'ApiKey\n(AES-256-GCM)', userX, by + 1.45, bw, 0.85, T.gold, '000000', 12, false);
  slide.addShape(pres.ShapeType.line, {
    x: userX + bw / 2, y: by + bh, w: 0, h: 1.45 - bh,
    line: { color: T.border, width: 1.5, endArrowType: 'arrow' },
  });

  // Append-only badge
  slide.addShape(pres.ShapeType.roundRect, {
    x: startX + 3 * (bw + gap) - 0.1, y: by + 1.0, w: bw + 0.2, h: 0.42,
    fill: { color: '0A2E20' },
    line: { color: T.green, width: 1 },
    rectRadius: 0.05,
  });
  slide.addText('★ append-only — no update or delete', {
    x: startX + 3 * (bw + gap) - 0.1, y: by + 1.0, w: bw + 0.2, h: 0.42,
    fontSize: 10,
    color: T.green,
    fontFace: T.font,
    align: 'center',
    valign: 'middle',
  });

  // Key design decisions
  addDivider(slide, 5.2);
  addBullets(slide, [
    'Blueprint.parameters stored as JSON — flexible for RSI + ICT strategies',
    'Subscription.symbolOverride lets testers pick their own asset per strategy',
    'ApiKey.label allows multiple broker accounts per user  (unique per user+label)',
  ], 0.45, 5.3, W - 0.9, 1.8, 12, T.muted, T.indigo);
}

// ─── Slide 10 — 3.6 CodeCharta ────────────────────────────────────────────────
{
  const slide = newSlide();
  addTopBar(slide);
  addSection(slide, '3.6 — Code Structure: CodeCharta Analysis');
  addHeadline(slide, 'We measured architectural health, then fixed it');

  // 2×2 grid
  const gx = 0.45;
  const gy = 1.35;
  const gw = 4.2;
  const gh = 3.4;
  const midX = gx + gw / 2;
  const midY = gy + gh / 2;

  // Quadrant backgrounds
  slide.addShape(pres.ShapeType.rect, { x: gx, y: gy, w: gw / 2, h: gh / 2, fill: { color: T.surface }, line: { color: T.border } });
  slide.addShape(pres.ShapeType.rect, { x: midX, y: gy, w: gw / 2, h: gh / 2, fill: { color: '3B1111' }, line: { color: T.border } });
  slide.addShape(pres.ShapeType.rect, { x: gx, y: midY, w: gw / 2, h: gh / 2, fill: { color: T.surface }, line: { color: T.border } });
  slide.addShape(pres.ShapeType.rect, { x: midX, y: midY, w: gw / 2, h: gh / 2, fill: { color: T.surface }, line: { color: T.border } });

  // Axes labels
  slide.addText('↑ High Churn', { x: gx, y: gy - 0.3, w: gw / 2, h: 0.28, fontSize: 10, color: T.muted, fontFace: T.font, align: 'center' });
  slide.addText('→ Large files (LOC)', { x: gx + gw - 1.6, y: gy + gh + 0.03, w: 1.6, h: 0.28, fontSize: 10, color: T.muted, fontFace: T.font });

  // Hotspot label
  slide.addText('🔴 HOTSPOT\n(large + high churn)', {
    x: midX + 0.1, y: gy + 0.15, w: gw / 2 - 0.2, h: gh / 2 - 0.3,
    fontSize: 14, color: T.red, fontFace: T.font, bold: true, align: 'center', valign: 'middle',
  });

  slide.addText('Stable & small', { x: gx, y: midY + gh / 4 - 0.15, w: gw / 2, h: 0.3, fontSize: 10, color: T.muted, fontFace: T.font, align: 'center' });
  slide.addText('Large but stable', { x: midX, y: midY + gh / 4 - 0.15, w: gw / 2, h: 0.3, fontSize: 10, color: T.muted, fontFace: T.font, align: 'center' });

  // Screenshot placeholder
  slide.addShape(pres.ShapeType.roundRect, {
    x: gx + gw + 0.35, y: gy, w: W - gx - gw - 0.8, h: gh,
    fill: { color: T.surface },
    line: { color: T.border, width: 1, dashType: 'dash' },
    rectRadius: 0.06,
  });
  slide.addText('[ SCREENSHOT PLACEHOLDER ]\nvantrade.cc.json in CodeCharta Visualization\n\nColor = rloc\nArea = rloc\nHeight = number_of_commits', {
    x: gx + gw + 0.35, y: gy, w: W - gx - gw - 0.8, h: gh,
    fontSize: 11, color: T.muted, fontFace: T.font, align: 'center', valign: 'middle',
  });

  // Hotspot table
  addDivider(slide, 4.87);

  const rows = [
    ['File', 'Smell', 'Fix', 'LOC Result'],
    ['blueprints.service.ts', 'SRP — CRUD + backtest in one class', 'Extracted BacktestService', '471 → 139'],
    ['alpaca.adapter.ts', 'God class — data + SDK + mapping', 'Extracted AlpacaMarketDataClient', '473 → 197'],
    ['BacktestPanel.tsx ×2', 'DRY — 5 utils copy-pasted', 'Shared components/backtest/', '265 → 177'],
    ['BlueprintReviewTable', 'High churn (unstable boundary)', 'Extracted useAdmin hook', 'Churn ↓'],
  ];

  addTable(slide, rows,
    0.45, 4.97, W - 0.9,
    [2.6, 3.4, 3.2, W - 0.9 - 2.6 - 3.4 - 3.2],
    T.indigo, T.surface, 10
  );
}

// ─── Slide 11 — Summary / Q&A ─────────────────────────────────────────────────
{
  const slide = newSlide();

  // Left indigo bar (mirror of title)
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.5, h: H,
    fill: { color: T.indigo },
    line: { color: T.indigo },
  });

  addSection(slide, "That's VanTrade", 0.18);

  slide.addText("That's VanTrade", {
    x: 0.9, y: 0.45, w: 10, h: 0.7,
    fontSize: 32, bold: true, color: T.white, fontFace: T.font,
  });

  addDivider(slide, 1.22, T.border);

  const decisions = [
    ['Modular Monolith', 'right-sized for the team and domain'],
    ['Hexagonal Architecture', 'broker-agnostic by design'],
    ['Repository Pattern', 'the DB is just a detail'],
    ['Append-only Ledger', 'trade history you can actually trust'],
    ['AES-256-GCM', "keys we'd never want exposed"],
    ['RBAC Guards', 'privilege escalation = direct financial risk'],
  ];

  decisions.forEach(([title, desc], i) => {
    const y = 1.4 + i * 0.65;
    slide.addText(`${title}  `, {
      x: 0.9, y, w: 3.5, h: 0.55,
      fontSize: 14, color: T.indigo, fontFace: T.font, bold: true,
    });
    slide.addText(`— ${desc}`, {
      x: 4.3, y, w: 8.0, h: 0.55,
      fontSize: 14, color: T.muted, fontFace: T.font,
    });
  });

  // Q&A
  slide.addText('Questions?', {
    x: 0.9, y: 5.65, w: 10, h: 1.1,
    fontSize: 44,
    bold: true,
    color: T.gold,
    fontFace: T.font,
  });

  // Gold bottom strip
  slide.addShape(pres.ShapeType.rect, {
    x: 0.5, y: H - 0.12, w: W - 0.5, h: 0.12,
    fill: { color: T.gold },
    line: { color: T.gold },
  });
}

// ─── Write output ─────────────────────────────────────────────────────────────
pres.writeFile({ fileName: OUTPUT_PATH })
  .then(() => console.log(`✅  Presentation saved → ${OUTPUT_PATH}`))
  .catch((err) => { console.error('❌  Failed:', err); process.exit(1); });
