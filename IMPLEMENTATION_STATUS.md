# Prozo FC Margin Monitor — Implementation Status & Plan

**Status Date:** November 17, 2026  
**Reference Document:** `agent.md`  
**Current Phase:** Prompt 11 Completed — All Prompts (0–11) & Acceptance Criteria Verified (100% COMPLETE)

---

## 1. Executive Summary & Verification Metrics

The complete end-to-end Prozo Fulfilment Centre (FC) Margin Monitoring system has been successfully built, migrated, seeded, built across all workspace packages, and verified through unit, integration, and end-to-end test suites.

- **Workspace Packages Built:** 6 of 6 (`@prozo/shared`, `@prozo/finance`, `@prozo/ai`, `@prozo/api`, `@prozo/worker`, `@prozo/web`) — `0 errors`.
- **Test Suites Passing:** 6 of 6 files (`tests/unit/financial-engine.test.ts`, `tests/unit/parser.test.ts`, `tests/unit/ai-workflow.test.ts`, `tests/integration/worker-concurrency.test.ts`, `tests/integration/auth-and-api.test.ts`, `tests/integration/end-to-end-pipeline.test.ts`).
- **Total Tests Passing:** 50 of 50 tests (`0 failures, 0 regressions`).
- **PostgreSQL 18 Instance:** Migrated and seeded (`prozo_margin` on `127.0.0.1:5432`).
- **Background Worker Queue:** Pure PostgreSQL `BackgroundJob` table with atomic `FOR UPDATE SKIP LOCKED`, fencing tokens, heartbeats, and exponential backoff retry. Zero Redis / BullMQ.
- **AI Architecture:** Strictly two LLM agents (`Investigation Agent` + `Recommendation Agent`) via LangGraph.js with FC-scoped read-only tools and deterministic fallback.
- **Frontend:** Next.js 15 enterprise dashboard with Tailwind CSS, KPI cards, S3 presigned upload UI, FC submission monitor, and anomaly feedback controls.

---

## 2. Checklist Mapped to Sections 1–15

### Section 1: Product Objective and Scope
- [x] Centralized multi-FC daily data upload (CSV/XLSX)
- [x] Single-FC upload mode (FC Manager restricted to assigned FC)
- [x] Direct presigned S3 upload architecture (zero file buffering in API memory)
- [x] PostgreSQL background ingestion & normalization
- [x] Deterministic P&L, target breaches, margin deviations, and FC colour status
- [x] LangGraph 2-agent workflow (Investigation + Recommendation) triggered for anomalies & Blue status
- [x] Async email notifications (digest per FC/date/submission version)
- [x] Next.js web application for Finance, Admins, and FC Managers
- [x] Human review & feedback on findings (acknowledge, resolve, dismiss with reason)
- [x] Verified Out of Scope: No Redis, No BullMQ, No Vector DB, No LLM-based financial math, No ERP integrations.

### Section 2: Architecture Decisions
- [x] Monorepo structure (`apps/api`, `apps/worker`, `apps/web`, `packages/shared`, `packages/finance`, `packages/ai`)
- [x] Modular monolith with separate runtime processes (API, Worker, Web)
- [x] PostgreSQL as system of record AND job queue
- [x] Zero Redis / BullMQ usage

### Section 3: Business Rules & Financial Calculations
- [x] Six cost lines: Manpower, Packaging, Power & Fuel, FC Rent, Equipment Rentals, Overheads
- [x] Cost % of Revenue = `(Cost / Revenue) * 100` (Decimal)
- [x] CM1 Amount = `Revenue - Manpower - Packaging`
- [x] CM1 % = `(CM1 / Revenue) * 100`
- [x] CM2 Amount = `CM1 - PowerFuel - FCRent - EquipmentRentals - Overheads`
- [x] CM2 % = `(CM2 / Revenue) * 100`
- [x] CM1 Target: 65%–70% (Anomaly: `< 62%` or `> 73%`, inclusive tolerance)
- [x] CM2 Target: 15%–30% (Anomaly: `< 12%` or `> 33%`, inclusive tolerance)
- [x] Cost Breaches: `BELOW_MIN` (< min target), `ABOVE_MAX` (> max target)
- [x] Excess Cost Amount = `Actual Cost - (Revenue * Max Target % / 100)`
- [x] FC Colour Coding:
  - `RED`: CM2% < 12%
  - `YELLOW`: 12% <= CM2% < 15% OR 30% < CM2% <= 33%
  - `GREEN`: 15% <= CM2% <= 30%
  - `BLUE`: CM2% > 33% (suspiciously high margin)
- [x] Weighted aggregate formulas for multi-FC summaries: `SUM(CM) / SUM(Revenue) * 100`

### Section 4: Data Ingestion and S3 Upload Architecture
- [x] S3 presigned PUT URL generation (`POST /api/v1/uploads/initiate`)
- [x] Client uploads directly to S3 (no file streaming through API in production flow)
- [x] Verification on complete (`POST /api/v1/uploads/:batchId/complete` via `HeadObject`)
- [x] Transactional insert of `PROCESS_UPLOAD` job
- [x] ExcelJS + CSV parser with flexible header normalizer
- [x] Submission versioning (`(fcId, businessDate, version)` with `isLatest` flag)
- [x] Detection and tracking of missing FC submissions

### Section 5: PostgreSQL-Backed Background Worker Architecture
- [x] `BackgroundJob` table with atomic claim (`FOR UPDATE SKIP LOCKED`)
- [x] Lease management, lock tokens, heartbeat mechanism
- [x] Exponential backoff retry with jitter
- [x] Stale lease recovery and dead-letter handling
- [x] Handlers:
  - `PROCESS_UPLOAD`
  - `ANALYZE_SUBMISSION`
  - `GENERATE_AI_REPORT`
  - `SEND_FC_DIGEST`

### Section 6: LangGraph Two-Agent Workflow
- [x] Agent 1: `Investigation Agent` (numerical observations, cost contributors, trends, hypotheses)
- [x] Agent 2: `Recommendation Agent` (action items, responsible teams: FC_OPERATIONS, FINANCE, PROCUREMENT, HR, MANAGEMENT)
- [x] Scoped historical tools: `getFcHistoricalPerformance`, `getCostLineTrend`, `getSimilarAnomalies`, `getPreviousInvestigations`, `getPriorResolutionFeedback`
- [x] Tool loop limits (max 3 rounds) and strict FC isolation
- [x] Structured output validation with Zod
- [x] Bounded retries and deterministic fallback report on LLM failure
- [x] Decoupled AI retry path (`GENERATE_AI_REPORT`) without recalculating P&L

### Section 7: Historical Memory & Human Review
- [x] Pure SQL/Prisma historical queries (7-day / 30-day averages, trend tracking)
- [x] Review endpoints (`ACKNOWLEDGED`, `DISMISSED` with reason, `RESOLVED`, `NEEDS_INVESTIGATION`)
- [x] Immutable audit trails for all actions

### Section 8: Email Architecture
- [x] Provider abstraction: `ResendEmailProvider`, `NodemailerEmailProvider`, `TestEmailProvider`
- [x] Asynchronous outbox (`EmailOutbox` table + `SEND_FC_DIGEST` job)
- [x] Responsive HTML + plaintext daily digest templates (Red, Yellow, Green, Blue, Missing)
- [x] Idempotent sending guarantees with provider message ID tracking

### Section 9: Database Design (Prisma)
- [x] `User`, `FulfilmentCentre`, `UserFulfilmentCentre`
- [x] `TargetRule` (effective dates, global vs FC-specific)
- [x] `UploadBatch`, `DailySubmission`
- [x] `DailyPnL`, `CostLineItem`
- [x] `Anomaly`, `AIReport`, `AIReportRun`
- [x] `BackgroundJob`, `WorkerHeartbeat`
- [x] `EmailOutbox`, `AnomalyReview`, `AuditLog`

### Section 10: REST API Contracts
- [x] Auth: `/api/v1/auth/login`, `logout`, `refresh`, `me` (HttpOnly cookies, bcrypt)
- [x] Uploads: `/api/v1/uploads/initiate`, `complete`, `status`
- [x] Dashboard: `/api/v1/dashboard/summary`, `/api/v1/dashboard/fc-status`
- [x] FCs: `/api/v1/fcs`, `/:fcId`, `/:fcId/pnl`, `/:fcId/anomalies`
- [x] Anomalies: `/api/v1/anomalies/:id`, `/review`
- [x] Targets: `/api/v1/target-rules` (Admin only)
- [x] Reprocessing: `/api/v1/submissions/:id/reprocess`, `/retry-ai`
- [x] Ops: `/health/live`, `/health/ready`, `/api/v1/admin/jobs`

### Section 11: Frontend Application (Next.js)
- [x] Enterprise dashboard with KPI cards and Recharts
- [x] Cross-FC table with colour badges and submission state
- [x] Upload interface (direct S3 upload, batch progress)
- [x] Daily submission monitor (shows missing FCs explicitly)
- [x] FC detail view (P&L breakdown, historical charts)
- [x] Anomaly & AI report view (verified financial facts vs AI hypotheses)
- [x] Target configuration UI

### Section 12: Monorepo & Directory Structure
- [x] Monorepo configuration via `pnpm` workspaces
- [x] Shared libraries (`packages/shared`, `packages/finance`, `packages/ai`)
- [x] Applications (`apps/api`, `apps/worker`, `apps/web`)

### Section 13: Environment Configuration
- [x] Validated `.env.example`, `.env`, and Zod-based config schemas

### Section 14: Testing Strategy & Acceptance Criteria
- [x] Unit tests for all financial formulas and boundary conditions (27 tests)
- [x] Excel/CSV parser tests (4 tests)
- [x] LangGraph AI agent tests with mock LLM and fallback (3 tests)
- [x] PostgreSQL worker concurrency & lease integration tests (`FOR UPDATE SKIP LOCKED`, 4 tests)
- [x] Role-based authorization & FC manager data isolation tests (5 tests)
- [x] End-to-end integration scenario (5 FC fixture: Green, Red, Yellow, Blue, Missing, 7 pipeline steps)

### Section 15: Documentation
- [x] Complete `README.md` satisfying all 17 requirements of Section 15.

---

## 3. Implementation Phase Plan & Audit

- [x] **Prompt 0:** Repository inspection and implementation plan (`IMPLEMENTATION_STATUS.md`).
- [x] **Prompt 1:** Monorepo foundation, configs, Docker Compose, base apps/packages.
- [x] **Prompt 2:** Prisma schema, migrations, seed script, repositories.
- [x] **Prompt 3:** S3 storage module, presigned PUT URL generation, upload lifecycle APIs.
- [x] **Prompt 4:** Spreadsheet/CSV parser, target resolution, and deterministic financial calculation engine with unit tests.
- [x] **Prompt 5:** PostgreSQL background worker (`FOR UPDATE SKIP LOCKED`), leases, retries, and upload/submission handlers.
- [x] **Prompt 6:** LangGraph.js two-agent workflow (Investigation + Recommendation) with FC tools and Zod validation.
- [x] **Prompt 7:** Email subsystem (Resend, Nodemailer, Test providers, templates, and outbox worker).
- [x] **Prompt 8:** REST API implementation, auth (HttpOnly cookies, RBAC, FC scoping), OpenAPI.
- [x] **Prompt 9:** Next.js enterprise frontend (Dashboard, S3 upload, monitors, FC details, anomaly reviews).
- [x] **Prompt 10:** End-to-end test fixtures (5 FC scenarios) and full workflow integration tests.
- [x] **Prompt 11:** Hardening, final test suite execution, README.md, and delivery verification.
