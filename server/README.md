# VASPTRACE API

Backend for **VASPTRACE**, a blockchain intelligence and financial investigation platform. The API powers the investigator workspace: cases, investigations, findings, evidence and reports.

> **Status: feature-complete.** Auth (JWT + bcrypt + RBAC), cases, investigations with the trace/intelligence engine, findings, sealed evidence, report generation, dashboard aggregation, audit logging, a demo seed, Docker packaging and CI are all implemented, type-checked and covered by 104 tests. GraphSense is integrated as the live chain-data provider with a deterministic offline fallback. The only deliberately outstanding piece is the trained ML model: `scoreRisk` is the swap-in point for model weights.

## Tech stack

| Concern        | Choice                          |
| -------------- | ------------------------------- |
| Runtime        | Node.js 20+                     |
| Framework      | Express 4                       |
| Language       | TypeScript (strict)             |
| Database       | MongoDB via Mongoose 8          |
| Validation     | Zod                             |
| Auth           | JWT + bcrypt                    |
| Dev runner     | tsx watch                       |

The API runs **independently** from the frontend (different port, own `package.json`).

## Folder structure

```text
server/
├── src/
│   ├── config/       env.ts (validated env), db.ts (Mongoose connection)
│   ├── controllers/  HTTP layer — request in, service call, response out
│   ├── services/     business logic
│   ├── models/       Mongoose schemas
│   ├── routes/       route definitions only (index.ts mounts feature routers)
│   ├── middleware/   auth, validate, error, notFound
│   ├── validators/   Zod schemas per module
│   ├── utils/        ApiError, ApiResponse, asyncHandler, generateId
│   ├── types/        express.d.ts (req.user augmentation)
│   ├── app.ts        Express app assembly
│   └── server.ts     entry point: connect DB, listen, graceful shutdown
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

Layering is strict: **routes → controllers → services → models**. No business logic in route files.

## Installation

```bash
cd server
npm install          # or: pnpm install / bun install
cp .env.example .env # then fill in the values
```

## Environment variables

| Variable         | Required | Default                 | Notes                                            |
| ---------------- | -------- | ----------------------- | ------------------------------------------------ |
| `PORT`           | no       | `5000`                  | HTTP port                                        |
| `NODE_ENV`       | no       | `development`           | `development` \| `test` \| `production`          |
| `MONGODB_URI`    | **yes**  | —                       | `mongodb://` or `mongodb+srv://` connection URI  |
| `JWT_SECRET`     | **yes**  | —                       | min 24 chars; `openssl rand -hex 48`             |
| `JWT_EXPIRES_IN` | no       | `7d`                    | token lifetime                                   |
| `CLIENT_URL`     | no       | `http://localhost:5173` | allowed CORS origin(s), comma-separated          |
| `GRAPHSENSE_API_URL` | no | — | GraphSense REST base URL; empty = synthetic provider |
| `GRAPHSENSE_API_KEY` | conditional | — | required whenever the URL is set |
| `GRAPHSENSE_TIMEOUT_MS` | no | `12000` | per-request timeout for chain lookups |
| `INTAKE_API_KEYS` | no | — | comma-separated API keys for NCRP/SAHYOG complaint intake |

Missing or invalid values abort startup with an explicit list of problems. Secrets are never hardcoded and `.env` is git-ignored.

## Running

```bash
npm run dev        # watch mode on http://localhost:5000
npm run build      # type-check + emit to dist/
npm start          # run the compiled build
npm run typecheck  # types only
npm test           # 81 tests
npm run seed       # load the demo investigation dataset (never in production)
```

### Docker

```bash
cd server
JWT_SECRET=$(openssl rand -hex 48) CLIENT_URL=http://localhost:8080 docker compose up --build
```

The database is not published to the host, the API runs as a non-root user, and the container image contains production dependencies only.

The process exits with a clear message if MongoDB is unreachable — it never serves traffic without a database.

## API overview

Base URL: `http://localhost:5000/api`

All endpoints except `/health*`, `/auth/register` and `/auth/login` require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health`, `/health/ready` | Liveness and readiness probes |
| POST | `/auth/register` | Create an account (first account becomes admin) |
| POST | `/auth/login` | Exchange credentials for a token |
| GET/PATCH | `/auth/me` | Read or update the current profile |
| POST | `/auth/password` | Change password (verifies the current one) |
| POST | `/auth/logout` | Audit-logged sign-out |
| GET | `/users` | Workspace directory (for case assignment) |
| PATCH | `/users/:id` | Admin only: role and activation |
| GET | `/dashboard/overview` | Aggregated command-centre metrics |
| GET | `/intelligence/providers` | Which chain-data provider serves each chain, and reachability |
| GET | `/intelligence/addresses/:chain/:address` | Address summary, attribution tags, baseline risk |
| GET | `/intelligence/addresses/:chain/:address/neighbours` | Ranked counterparties (`direction`, `limit`, `minValueUsd`) |
| GET/POST | `/cases` | List (paginated, filtered, text search) and create |
| GET/PATCH/DELETE | `/cases/:id` | Detail (with children), update, cascade delete |
| POST/DELETE | `/cases/:id/assignees[/:userId]` | Assign or unassign an investigator |
| GET/POST | `/investigations` | List traces, start a trace |
| GET | `/investigations/:id` | Investigation record |
| GET | `/investigations/:id/graph` | Bounded hop graph (nodes + edges) |
| GET | `/investigations/:id/analysis` | Ranked paths, behavioural signals, risk |
| POST | `/investigations/:id/rerun` | Re-queue the trace |
| GET/POST | `/findings` | List and record findings |
| GET/PATCH/DELETE | `/findings/:id` | Read, update, delete |
| GET/POST | `/evidence` | List and pin (seals a SHA-256 checksum) |
| GET | `/evidence/:id/verify` | Re-verify the chain-of-custody seal |
| PATCH/DELETE | `/evidence/:id` | Metadata only / owner-or-admin delete |
| GET/POST | `/reports` | List and generate a report from case contents |
| GET | `/reports/:id/export.csv` | CSV export |
| PATCH/DELETE | `/reports/:id` | Update (finalised reports are locked), delete |

```bash
curl http://localhost:5000/api/health
```


### Response contract

Success:

```json
{ "success": true, "message": "Human readable message", "data": {} }
```

Paginated `data`:

```json
{ "items": [], "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 } }
```

Error:

```json
{ "success": false, "message": "Human readable error message", "errors": [{ "field": "email", "message": "..." }] }
```

Handled centrally: Zod and Mongoose validation errors, duplicate keys (409), invalid ObjectIds, JWT invalid/expired (401), authorization (403), unknown (500). Stack traces are included only outside production.

## Authentication

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- bcrypt-hashed passwords, never returned in responses
- JWT bearer tokens: `Authorization: Bearer <token>`
- `requireAuth` attaches `req.user` and re-reads the account so deactivation is immediate; `requireRole("admin")` enforces roles
- Roles: `investigator`, `admin`

## Chain data — GraphSense integration

Chain data is reached through one narrow provider contract
(`services/blockchain/types.ts`): `getAddress`, `getNeighbours`, `getTags`,
`healthcheck`. Two implementations ship:

| Provider | When it is used | Notes |
| --- | --- | --- |
| `GraphSenseProvider` | `GRAPHSENSE_API_URL` set **and** the chain is indexed | GraphSense REST (self-hosted or Iknaio-hosted) |
| `SyntheticProvider` | otherwise | deterministic, offline, used by local dev, CI and demos |

Resolution is per chain, not global: GraphSense indexes `btc`, `eth` and `trx`,
so `bitcoin`, `ethereum` and `tron` go live while `polygon`, `bsc` and
`arbitrum` stay on the synthetic provider instead of hitting an endpoint that
can only 404. `GET /api/intelligence/providers` reports the exact mapping.

What the adapter owns (and nothing else in the codebase knows about):

- currency-code mapping, pagination and `pagesize` headroom;
- fiat arrays → a single USD number, unix seconds → `Date`;
- tag taxonomy → `category`, `entity`, `isVasp`, and a normalised 0–1
  confidence from GraphSense's confidence levels/bands;
- token transfer totals preferred over the native value when larger.

Hardening in the request path: the API key travels in the `Authorization`
header (never the URL), every call has a bounded timeout, transient network
and 5xx failures are retried once, and provider responses are translated into
`404` / `429` / `502` — an upstream body is never forwarded to a client.

Expansion (`services/blockchain/expansion.ts`) mirrors the pure engine's
contract against live data: bounded hops, a node ceiling, at most six
counterparties per address, no revisits, regulated services treated as
terminal, and each parent's traced value distributed across counterparties in
proportion to the value actually observed on those edges — value is never
invented. Ranking, signal detection and risk scoring stay in the pure engine,
so analysis is identical whichever provider produced the graph.

A live-provider failure mid-trace degrades to the synthetic trace rather than
failing the investigation, and every investigation records `dataSource`
(`graphsense` | `synthetic`) so nothing is presented as live data when it is
not.

## Complaint intake, attribution and alerting

Victim-reported wallet addresses arrive from a cybercrime portal and are turned
into actionable attribution automatically.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/intake/complaints` | `x-api-key` | NCRP / SAHYOG / LEA machine intake (idempotent on `externalRef`) |
| GET | `/api/complaints` | session | Triage list, filterable by status, source, risk category |
| GET | `/api/complaints/queue` | session | Queue rollups: totals, attribution rate, highest-risk complaints |
| POST | `/api/complaints` | session | Investigator-filed complaint |
| POST | `/api/complaints/attribute` | session | Ad-hoc real-time attribution of one address |
| GET | `/api/complaints/:id` | session | Complaint with per-address attribution |
| GET | `/api/complaints/:id/report` | session | Standardised LEA attribution report |
| POST | `/api/complaints/:id/retriage` | session | Re-run attribution (e.g. wider hop bound) |
| POST | `/api/complaints/:id/escalate` | session | Promote the complaint into a case |
| GET | `/api/alerts` | session | Automated alert queue |
| PATCH | `/api/alerts/:id/status` | session | Acknowledge / action / dismiss an alert |

**Pipeline.** Intake acknowledges immediately and triages asynchronously, so an
upstream portal is never blocked on chain lookups. For each suspect address the
attribution service runs the bounded trace against the live provider (falling
back to the deterministic ledger, and saying so), then:

1. finds every regulated touchpoint and ranks them nearest-first, with a
   confidence that combines proximity, attribution strength and value continuity;
2. classifies intermediary wallets by role (splitter, consolidator, pass-through,
   layering);
3. flags cross-chain bridge hops and mixer/privacy-service exposure;
4. extracts a normalised feature vector, classifies the fraud typology, and
   scores risk 0–100 with the driving reasons listed;
5. raises deduplicated alerts, each with concrete recommended actions.

Complaint-level risk is the worst of its addresses, and the primary VASP is the
closest highest-confidence touchpoint across all of them — that is who receives
the freeze request.

**Typology model.** `typology.service.ts` uses one explicit linear (logistic)
model per fraud class over structural graph features. Weights are constants, so
every prediction is fully explainable — a requirement for evidence that may be
presented in court. Training new weights is a data change, not a code change.

## Intelligence engine

`services/intelligence.service.ts` is pure and deterministic — no database, no network — which is what makes it testable and swappable:

- `expandGraph` — bounded breadth-first hop expansion preserving value continuity; terminal (service) addresses never forward value.
- `rankPaths` — root-to-leaf paths scored by retained value, aggregate risk, hop economy and service termination; every path carries a plain-language rationale.
- `detectSignals` — mixer touchpoints, peeling/splitting, structuring bursts and regulated-service exposure, each with confidence and supporting addresses.
- `scoreRisk` — blends structural risk with signal severity into a bounded 0–100 score.

Replacing the synthetic expansion with a real chain-ingestion adapter, or `scoreRisk` with trained model weights, requires no changes to the HTTP layer.

## Data model

`User`, `Case`, `Investigation` (embedded graph + metrics), `Finding`, `Evidence` (sealed payload + SHA-256), `Report`, `AuditLog`, `Counter` (atomic `CASE-2026-0001`-style references).

Authorisation is centralised in `services/access.service.ts`: every case-scoped read and write passes `assertCaseAccess`, unauthorised ids return `404` so they cannot be enumerated, and destructive actions additionally require case ownership or admin.

## Security & production-readiness audit

Findings resolved during the audit pass:

| Area | Issue found | Fix |
| --- | --- | --- |
| Authorization (data layer) | Demo rows had no owner, so any signed-in investigator could update/delete them (IDOR) | Backfilled owners, added `NOT NULL` + owner defaults, recreated update/delete policies with owner-or-admin `WITH CHECK` |
| Error responses | Stack traces were returned outside production (including test) | Stacks are now development-only; 5xx details go to structured logs |
| Transport hardening | No security headers, no rate limiting | `helmet` (strict CSP, no-referrer, HSTS in prod), global + auth + heavy + upload rate limiters |
| NoSQL injection | Mongo operators could reach query filters | Request scrubber strips `$`/dotted/prototype keys; mongoose `sanitizeFilter` + `strictQuery` |
| Input validation | No shared contract | `validate()` Zod middleware for body/params/query, strict objects, whitelisted sort fields, bounded pagination |
| Logging | Risk of credential leakage | Structured JSON logger with key redaction and correlation ids |
| Availability | Single health endpoint; abrupt shutdown | `/api/health` liveness + `/api/health/ready` readiness (503 when DB down/draining), connection draining, socket timeouts, resilient rejection handling |
| Payloads | Unbounded bodies, raw JSON parse errors | 512kb limit, controlled 400/413 responses |
| CORS | Permissive by default | Explicit origin allowlist; wildcard/localhost origins rejected in production |

### Testing

```bash
npm test          # 104 tests: transport, validation, security, redaction, auth guards, intelligence engine, GraphSense adapter
npm run typecheck
```
