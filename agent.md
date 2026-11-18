# Prozo FC Margin Monitor — Agent Build Specification

> **Purpose:** This file is the source of truth for an AI coding editor (Cursor, Claude Code, Codex, Windsurf, or similar) that will implement the complete Prozo FC Margin Monitoring application in this repository.
>
> **Instruction to the coding agent:** Read this entire file before making changes. Treat the architecture, financial rules, security requirements, data contracts, and acceptance criteria as implementation requirements. Build the real application incrementally. Do not stop at scaffolding, mock screens, interfaces, or TODO comments.

---

# 0. Operating instructions for the coding agent

You are acting as a senior full-stack engineer, backend architect, database engineer, applied AI engineer, and test engineer. Your task is to implement a working end-to-end prototype of **Prozo FC Margin Monitor** in the current repository.

## 0.1 How to work

1. Inspect the repository before changing anything. Preserve useful existing work.
2. Read this file fully and turn its implementation phases into a checklist.
3. If `Case Study 3.xlsx` or another supplied case-study workbook exists in the repository, inspect the actual workbook, worksheet names, headers, sample records, and target ranges before implementing spreadsheet mapping or target seeding.
4. Do not invent cost-line target ranges. If the workbook is unavailable, implement configurable targets and clearly label development-only sample targets as illustrative.
5. Implement the project in the phases listed at the end of this document. Complete and verify one phase before moving to the next.
6. Prefer working, tested code over excessive abstraction. Use a modular monolith, not microservices.
7. Use stable, mutually compatible released package versions. Do not blindly install release candidates or prereleases. Check current official package documentation when an API is version-sensitive. Pin dependency versions and commit the lockfile.
8. Do not rewrite existing working modules without a concrete reason.
9. Do not ask the user to make decisions that are already specified here. When a non-critical implementation detail is unspecified, choose a conservative default, document it, and continue.
10. Do not claim a feature works until its code and test have been run.
11. Do not leave production paths backed by hardcoded arrays, fake API responses, or mock-only implementations. Mocks are allowed in tests and an explicitly labelled demo-seed environment only.
12. Never silently skip failed rows, FCs, agent executions, or emails. Persist a clear status and error that an operator can inspect.
13. After every phase, report files created/modified, commands run, test results, and known blockers. Then continue to the next phase unless blocked by missing credentials or unavailable external infrastructure. A lack of cloud credentials must not prevent local tests with mocks or MinIO.

## 0.2 Mandatory engineering standards

- TypeScript strict mode.
- No `any` in application code unless a third-party boundary makes it unavoidable and it is immediately narrowed.
- Zod validation at request, file-import, job-payload, LLM-output, and environment boundaries.
- Decimal arithmetic for money and percentages. Use Prisma `Decimal` / `decimal.js`; do not use JavaScript floating-point arithmetic for financial calculations.
- PostgreSQL is the system of record.
- Prisma is the application ORM for business data.
- S3 is the private object store for uploaded source files.
- PostgreSQL-backed jobs are the only background queue in this prototype.
- **Do not add Redis, BullMQ, Celery, RabbitMQ, Kafka, or another external queue.**
- LangGraph.js orchestrates exactly two LLM-powered agents: `Investigation Agent` and `Recommendation Agent`.
- Financial calculations and threshold checks are deterministic TypeScript functions, never LLM tasks.
- Email delivery is asynchronous and independent of financial computation.
- Use transactions for related database writes and unique constraints for idempotency.
- Use structured logs with request ID, batch ID, submission ID, job ID, FC ID, and workflow run ID where applicable.
- Store timestamps in UTC. Store business dates as date-only values and interpret them in the configured business timezone.
- Keep secrets out of source control, logs, prompts, job payloads, and frontend bundles.
- Preserve original uploaded files and financial source values. Corrections create a new submission version; they do not silently overwrite history.

---

# 1. Product objective and scope

Prozo operates multiple fulfilment centres (FCs). Each FC has daily Revenue and six cost lines. Leadership needs same-day visibility when an FC's margins deteriorate and needs to know which cost lines breached their targets.

The prototype must support:

1. A Finance/Admin user uploads one consolidated CSV/XLSX file containing daily data for multiple FCs. A secondary single-FC upload mode may be supported.
2. The backend stores the original file in a private S3 bucket using a presigned upload flow.
3. The backend verifies the uploaded object and schedules ingestion in PostgreSQL.
4. A PostgreSQL-backed worker downloads and parses the file, validates rows, maps each record to an FC and business date, and creates per-FC/day submissions.
5. The financial engine computes P&L, target breaches, margin deviations, and FC colour status.
6. Only submissions requiring AI investigation enter the LangGraph workflow.
7. The Investigation Agent evaluates numerical evidence and historical FC performance.
8. The Recommendation Agent turns validated findings into practical corrective actions.
9. AI outputs are structured, validated, and persisted.
10. A separate email worker sends one digest per eligible FC/day/submission version through Resend or Nodemailer.
11. A Next.js dashboard displays cross-FC status, missing submissions, daily P&L, anomalies, historical trends, and investigation reports.
12. Managers can acknowledge, resolve, dismiss with a reason, or add feedback to findings. They cannot silently edit source financial figures.

## 1.1 Explicitly out of scope for the first prototype

Do not implement these unless required for a core feature:

- Microservices or Kubernetes.
- Redis or BullMQ.
- Vector database or embeddings.
- Autonomous operational actions (e.g. changing rosters, approving purchase orders, changing spend).
- LLM-generated P&L or LLM-based threshold decisions.
- ERP/accounting integrations.
- WhatsApp delivery.
- Complex forecasting or custom ML models.
- Automatic learning that changes financial target rules.

Historical memory is implemented with SQL queries and structured historical records in PostgreSQL. A vector database is not required.

---

# 2. Architecture decisions

## 2.1 Technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js App Router, React, TypeScript | Admin, Finance and FC Manager UI |
| Styling | Tailwind CSS and reusable accessible components | Responsive enterprise UI |
| Charts | Recharts | Revenue, margin and cost trends |
| API | Node.js, Express, TypeScript | REST API, auth, upload initiation, dashboard and review endpoints |
| Validation | Zod | API, import, job and AI-output validation |
| Database | PostgreSQL | Business data, jobs, historical memory and audit trail |
| ORM | Prisma | Business records, migrations and repositories |
| Object storage | Amazon S3 | Private original CSV/XLSX uploads |
| S3 SDK | AWS SDK for JavaScript v3 | Presigned URLs, HeadObject, GetObject |
| Background work | Custom PostgreSQL-backed job queue/worker | Upload parsing, FC analysis, AI workflow, email |
| AI orchestration | LangGraph.js | Investigation and recommendation workflow |
| LLM | OpenAI initially, behind a provider interface | Structured agent output and investigation tool calls |
| Workflow checkpoints | LangGraph PostgresSaver (if compatible with selected LangGraph.js release) | Persist graph execution state |
| Email | Resend by default; Nodemailer SMTP adapter | FC manager and central Finance digests |
| Logging | Pino or equivalent structured logger | API and worker diagnostics |
| Tests | Vitest (or Jest if already established), Supertest, Playwright | Unit, integration and browser tests |
| Local infra | Docker Compose | PostgreSQL and optional MinIO |

Use released package versions compatible with the chosen Node.js LTS version. Verify current LangGraph.js, Prisma, AWS SDK, Resend and Nodemailer APIs before implementation.

## 2.2 Deployment shape

Use a **modular monolith with separate runtime processes**:

```text
                         ┌───────────────────────────┐
                         │      Next.js Web App      │
                         │ Dashboard / Upload / FC   │
                         └─────────────┬─────────────┘
                                       │ HTTPS / REST
                         ┌─────────────▼─────────────┐
                         │       Express API         │
                         │ Auth / Upload / Read APIs │
                         └──────┬─────────────┬──────┘
                                │             │
                    Presigned S3│             │PostgreSQL transaction
                                │             │creates durable job
                         ┌──────▼──────┐  ┌───▼──────────────────┐
                         │  Private S3 │  │     PostgreSQL       │
                         │ Source File │  │ Business Data + Jobs │
                         └──────┬──────┘  └───┬──────────────────┘
                                │             │ poll/claim/lease
                                └──────┬──────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │   Background Worker(s)   │
                         │ Ingest / Finance / AI /   │
                         │ Email / Reconciliation   │
                         └──────┬─────────────┬──────┘
                                │             │
                       ┌────────▼──────┐ ┌────▼────────────┐
                       │ LangGraph.js  │ │ Resend / SMTP   │
                       │ 2 LLM Agents  │ │ Email Provider  │
                       └───────────────┘ └─────────────────┘
```

The API and worker are separate processes but may share the same code packages and PostgreSQL database. The worker can run one or more replicas because job claiming uses PostgreSQL row locks and leases.

## 2.3 No Redis / BullMQ

The application must use a PostgreSQL-backed worker. Implement a durable `BackgroundJob` table and a worker loop that claims jobs with PostgreSQL `FOR UPDATE SKIP LOCKED`.

Do not install Redis or BullMQ. Do not describe the job system as BullMQ. The custom database job queue must provide:

- Atomic job claiming.
- Multiple worker processes.
- Lease/lock ownership and expiry.
- Heartbeat/lease renewal for long jobs.
- Bounded retries with exponential backoff and jitter.
- Dead-letter/terminal failure state.
- Idempotency keys.
- Job progress and error tracking.
- Graceful shutdown.
- Recovery of jobs abandoned by crashed workers.
- Operational reconciliation for stuck jobs.

A durable job record is inserted in the same PostgreSQL transaction as the business state that requires the job. That removes the need for a Redis broker or a database-to-Redis dispatch process.

---

# 3. Business rules and financial calculations

These rules are authoritative. Implement them in `packages/finance` as pure, deterministic functions with unit tests.

## 3.1 Input fields

Each logical day-level FC record contains:

```text
Business Date / Day
FC_ID (required for a consolidated multi-FC file)
Revenue
Manpower Cost
Packaging Cost
Power & Fuel
FC Rent
Equipment Rentals
Overheads
```

A single-FC upload may supply `fcId` as trusted upload metadata rather than requiring it in every worksheet row.

Currency must be explicit or configured for the FC. Do not silently mix currencies. The initial prototype can use the case-study currency if verified from the workbook; otherwise configure currency per FC.

## 3.2 Cost percentages

For each of the six cost lines:

```text
Cost % of Revenue = (Cost Amount / Revenue) * 100
```

Cost lines:

- Manpower Cost
- Packaging Cost
- Power & Fuel
- FC Rent
- Equipment Rentals
- Overheads

## 3.3 Contribution margins

```text
CM1 = Revenue - Manpower Cost - Packaging Cost
CM1% = (CM1 / Revenue) * 100

CM2 = CM1
      - Power & Fuel
      - FC Rent
      - Equipment Rentals
      - Overheads
CM2% = (CM2 / Revenue) * 100
```

CM1 and CM2 are amounts, not percentages. Persist both amounts and percentages.

## 3.4 Target rules

- CM1 target band: 65%–70%.
- CM2 target band: 15%–30%.
- Margin anomaly tolerance: plus/minus 3 percentage points outside each target band.

Therefore:

```text
CM1 anomaly when CM1% < 62% OR CM1% > 73%.
CM2 anomaly when CM2% < 12% OR CM2% > 33%.
```

The boundaries are inclusive as the normal tolerance envelope: exactly 62%, 73%, 12%, or 33% is not a margin deviation anomaly.

Cost-line min/max target ranges must be read from the supplied `Case Study 3.xlsx` first tab or configured in the target-management UI/database. **Do not make up missing cost targets.**

Target resolution order:

1. An effective FC-specific target rule for that metric and business date.
2. An effective global target rule for that metric and business date.
3. If no rule exists, mark the metric as `TARGET_NOT_CONFIGURED`; do not classify it as compliant.

Persist an immutable target snapshot with every DailyPnL calculation so past results remain reproducible if targets change later.

## 3.5 Cost-line breach rules

For a cost line with configured target `[min, max]`:

- Actual percentage below `min`: `BELOW_MIN` anomaly. It may indicate unusually low cost or under-reporting; do not automatically claim savings.
- Actual percentage greater than `max`: `ABOVE_MAX` anomaly.
- Exact min or max: within range.

For upper breaches, calculate deterministic monetary overrun:

```text
Excess Cost = Actual Cost - (Revenue * Max Target % / 100)
```

Only positive excess amounts count as over-budget impact. Sort upper-breach cost contributors by excess amount descending. Keep below-minimum findings separate from over-budget contributors.

## 3.6 FC colour code

Use the unrounded CM2 percentage for classification:

```text
RED:
  CM2% < 12%

YELLOW:
  12% <= CM2% < 15%
  OR
  30% < CM2% <= 33%

GREEN:
  15% <= CM2% <= 30%

BLUE:
  CM2% > 33%
```

Interpretation:

- Red: critical margin deterioration.
- Yellow: margin warning.
- Green: normal target range.
- Blue: suspiciously high margin; verify omitted, delayed, or under-reported expenses.

Colour classification is independent of cost-line anomalies. A Green FC can still have a cost-line breach. A Yellow FC within the CM2 tolerance envelope does not necessarily have a CM2 margin anomaly. Blue triggers a data-quality investigation even if no upper cost breach exists.

If revenue is missing, zero, negative, or invalid, do not calculate percentages or assign a financial colour. Use a separate data-quality/submission status such as `INVALID_DATA` or `MISSING`.

## 3.7 Data-quality behaviour

- Reject or mark invalid rows with missing required monetary values; do not coerce missing costs to zero unless the source contract explicitly defines blank as zero.
- Revenue must be positive.
- Costs must be non-negative unless the business explicitly supports credits/reversals and their treatment is configured.
- Duplicate `(fcId, businessDate)` rows in a single source file are validation errors unless the workbook definition explicitly states that aggregation is required.
- Never silently aggregate duplicate rows.
- Keep the original source row index and raw input for audit.
- Formula cells with no cached result must be reported; do not execute workbook macros or formulas.
- A missing FC submission must never be displayed as Green.

## 3.8 Aggregate dashboard calculations

For a set of FCs:

```text
Aggregate CM1% = SUM(CM1 amounts) / SUM(Revenue) * 100
Aggregate CM2% = SUM(CM2 amounts) / SUM(Revenue) * 100
```

Do not average individual FC percentages. Make currency scope explicit; only aggregate money values across compatible currencies or convert using a documented exchange-rate source (not required in first prototype).

---

# 4. Data ingestion and upload architecture

## 4.1 Upload modes

Support:

- `CENTRALIZED`: Finance/Admin uploads one consolidated file covering multiple FCs.
- `SINGLE_FC`: An authorized user uploads a file for one FC, with the FC ID supplied in upload metadata.

The first prototype should prioritize `CENTRALIZED` mode.

A consolidated file must identify the FC for each row using `FC_ID`/configured equivalent. Do not infer FC identity from a filename.

## 4.2 S3 storage flow

Use direct browser-to-S3 upload:

1. Frontend calls `POST /api/v1/uploads/initiate` with filename, content type, size, and mode.
2. API authenticates and authorizes the user.
3. API validates allowed format/size and creates `UploadBatch` with status `INITIATED`.
4. API generates a short-lived S3 presigned PUT URL. The browser receives only the URL and required headers, never AWS credentials.
5. Frontend uploads file bytes directly to S3.
6. Frontend calls `POST /api/v1/uploads/:batchId/complete`.
7. API verifies ownership, calls `HeadObject`, checks actual object size and content metadata, and updates batch to `UPLOADED`.
8. In the same Prisma/PostgreSQL transaction, insert a `BackgroundJob` with type `PROCESS_UPLOAD` and a unique idempotency key.
9. API returns the batch ID and current status; frontend polls status.

Use unique S3 object keys, e.g.:

```text
uploads/{tenant-or-org-id}/{user-id}/{batch-id}/{uuid}.{ext}
```

Never use an untrusted filename as the complete key. Keep the bucket private, block public access, enable server-side encryption, restrict CORS to the frontend origin, and use least-privilege IAM. Use AWS IAM roles in production; local environment credentials are allowed only for local development.

A presigned PUT URL does not replace server-side verification. Enforce a file-size ceiling at initiation and verify actual size after upload. Verify extension, MIME metadata, and file signature/parser compatibility in the worker. Treat all uploaded file content as untrusted.

## 4.3 Parser and normalizer

Use ExcelJS for `.xlsx` and a maintained CSV parser. Inspect the actual supplied case-study workbook before deciding exact worksheet and header mappings.

Create a configurable header map supporting common header variations, but do not silently map ambiguous columns. Provide useful row-level validation errors.

Normalize into a typed schema with decimal strings, for example:

```ts
interface DailyFCInput {
  fcId: string;
  businessDate: string; // YYYY-MM-DD
  currency: string;
  revenue: string;
  manpowerCost: string;
  packagingCost: string;
  powerFuelCost: string;
  fcRent: string;
  equipmentRentals: string;
  overheads: string;
  sourceRowIndex: number;
}
```

Handle Excel date serials, ISO dates, locale-safe numeric strings, thousands separators, blank rows, duplicate FC/date rows, unknown FC IDs, invalid amounts, multiple worksheets, missing headers, formula cells without cached values, and inconsistent currency. Keep row-level errors and allow valid rows to be processed when other rows are invalid, while marking the batch `PARTIALLY_FAILED` when appropriate.

## 4.4 FC/day submission creation

Group normalized records by `(fcId, businessDate)`.

For every date present in a centralized batch, compare the rows to active FCs. Create an explicit missing-submission record for an expected FC only if there is no existing valid/latest submission for that FC/date. Do not downgrade a previously received valid submission to missing merely because it is absent from a later partial upload. Keep batch-specific inclusion/validation results so operators can see which FCs were present in the current file.

For corrected data, create a new immutable `DailySubmission` version. Allocate versions safely under concurrent ingestion using a PostgreSQL row lock/advisory lock or serializable transaction. Only one submission version should be marked latest for an FC/date.

---

# 5. PostgreSQL-backed background worker architecture

This is a critical architectural requirement. **No Redis, BullMQ, or external message broker.**

## 5.1 Job types

Create a `BackgroundJob` table with a typed job name:

- `PROCESS_UPLOAD`
- `ANALYZE_SUBMISSION`
- `GENERATE_AI_REPORT` (optional separate retry path)
- `SEND_FC_DIGEST`
- `SEND_MISSING_SUBMISSION_ALERT`
- `RECONCILE_STALE_WORK`

Job payloads must contain IDs and small metadata only, not entire spreadsheets, S3 objects, raw financial workbooks, credentials, or large historical contexts.

Example payloads:

```ts
type ProcessUploadPayload = { batchId: string };
type AnalyzeSubmissionPayload = { submissionId: string };
type GenerateAIReportPayload = { submissionId: string; force?: boolean };
type SendFCDigestPayload = { emailOutboxId: string };
type SendMissingAlertPayload = { submissionId: string };
```

## 5.2 BackgroundJob data model

Fields:

```text
id                  UUID/CUID primary key
jobType             enum/string
payload             JSONB
status              PENDING | RUNNING | RETRY_WAIT | SUCCEEDED | FAILED | CANCELLED
priority            integer
idempotencyKey      unique string
attempts            integer default 0
maxAttempts         integer
availableAt         timestamptz
lockedAt            timestamptz nullable
lockedBy            string nullable
lockToken           UUID nullable
heartbeatAt         timestamptz nullable
startedAt           timestamptz nullable
completedAt         timestamptz nullable
lastError           JSONB/text nullable
result              JSONB nullable
createdAt           timestamptz
updatedAt           timestamptz
```

Add indexes for `(status, availableAt, priority)`, `(lockedAt)`, `(jobType, status)`, and unique `idempotencyKey`.

## 5.3 Atomic job claiming

Implement job claiming with raw SQL inside a short PostgreSQL transaction. Use `FOR UPDATE SKIP LOCKED` so multiple workers can claim different rows without blocking one another.

A representative pattern (adapt and test it for the selected PostgreSQL version and Prisma API):

```sql
WITH candidate AS (
  SELECT id
  FROM "BackgroundJob"
  WHERE status IN ('PENDING', 'RETRY_WAIT')
    AND "availableAt" <= NOW()
  ORDER BY priority DESC, "availableAt" ASC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE "BackgroundJob" AS job
SET status = 'RUNNING',
    attempts = attempts + 1,
    "lockedAt" = NOW(),
    "heartbeatAt" = NOW(),
    "lockedBy" = $1,
    "lockToken" = $2,
    "startedAt" = COALESCE("startedAt", NOW()),
    "updatedAt" = NOW()
FROM candidate
WHERE job.id = candidate.id
RETURNING job.*;
```

Important requirements:

- Use a unique worker ID and fresh lock token per claim.
- The actual claim operation must be atomic.
- Do not hold the row-lock transaction open while running the job.
- Commit the claim immediately, then execute the handler.
- On completion/failure, update only if the row still has the same lock token and worker ID.
- A worker must not complete a job whose lease has been acquired by another worker.
- Use `SKIP LOCKED` for concurrency, not an application-level `SELECT` followed by an unprotected `UPDATE`.

## 5.4 Lease and heartbeat

Long-running ingestion or AI jobs may exceed a static lease. Implement:

- Configurable lease duration.
- Heartbeat update every fraction of the lease duration.
- Conditional heartbeat using job ID and lock token.
- A recovery query for `RUNNING` jobs whose heartbeat/lease expired.
- A stale-job reaper that safely moves expired jobs to `RETRY_WAIT` or `FAILED` according to attempt count.
- Protection against a stale worker writing results after its lease was lost.

Use a lease token as a fencing token. Business writes should additionally be idempotent and protected by unique constraints.

## 5.5 Retry and dead-letter behaviour

Implement bounded exponential backoff with jitter:

```text
nextDelay = min(baseDelay * 2^(attempts - 1), maxDelay) + randomJitter
```

Distinguish retryable errors (temporary S3/network/LLM/database/provider failures) from permanent errors (invalid file schema, unknown FC ID, missing mandatory values, unsupported file type). Permanent validation failures should be persisted as terminal outcomes without pointless retries.

When `attempts >= maxAttempts`, mark job `FAILED`, save a sanitized error, and expose it to the UI/admin monitoring. Do not discard failed job history.

## 5.6 Worker lifecycle

Create one worker runtime with handlers registered by job type. It may run multiple handler loops with configurable concurrency, but job claims must remain database-coordinated.

Implement:

- Graceful SIGTERM/SIGINT shutdown.
- Stop claiming new work during shutdown.
- Finish or safely release claimed work.
- Database pool cleanup.
- Structured logs.
- Job progress updates.
- Worker health endpoint or process heartbeat.
- A scheduled reconciliation loop (can run inside worker process) for expired leases and missing durable work.

## 5.7 Transactional scheduling

Insert jobs directly into `BackgroundJob` within the same PostgreSQL transaction as the business state that requires the job.

Examples:

- Upload completion transaction: update `UploadBatch` and insert `PROCESS_UPLOAD` job.
- Ingestion transaction: create/update submission records and insert `ANALYZE_SUBMISSION` jobs.
- Analysis/report transaction: persist P&L/anomalies/AI report and insert `SEND_FC_DIGEST` job.
- Email outbox transaction: create `EmailOutbox` plus its send job atomically.

This avoids a dual-write to Redis. A separate generic QueueOutbox table is not required for the prototype because the PostgreSQL job row itself is transactionally durable. If the implementation uses an outbox pattern instead, document why and keep its delivery/replay logic in PostgreSQL only.

## 5.8 Job idempotency

Use deterministic idempotency keys such as:

```text
process-upload:{batchId}
analyze-submission:{submissionId}:{calculationVersion}
generate-ai:{submissionId}:{promptVersion}
send-digest:{emailOutboxId}
```

The job table unique key prevents duplicate job scheduling. Business tables also need their own unique constraints. Never depend on queue/job dedupe alone for financial correctness.

---

# 6. LangGraph workflow — exactly two agents

The AI workflow contains **exactly two LLM-powered agents**:

1. Investigation Agent.
2. Recommendation Agent.

Other graph nodes are deterministic data loaders, tool executors, schema validators, and retry routers. Do not create additional LLM agents.

## 6.1 Execution policy

- Run AI only when there is a material anomaly or a Blue suspicious-margin status requiring review.
- Healthy, non-suspicious records with no cost-line anomalies do not need LLM calls.
- A Yellow CM2 colour alone is not necessarily a CM2 anomaly because the ±3pp envelope is wider than the base target band. It can still be investigated if a cost line is anomalous.
- Persist financial computation before invoking the LLM.
- If AI fails, the P&L and anomaly results remain valid and visible; report `AI_ANALYSIS_FAILED` separately and allow AI-only reprocessing.
- Never send email from inside a LangGraph node.

## 6.2 Graph

```text
START
  |
  v
load-submission-and-pnl
  |
  v
load-historical-context
  |
  v
investigation-agent  <---- read-only tools / bounded tool loop
  |
  v
validate-investigation
  | valid
  v
recommendation-agent
  |
  v
validate-recommendation
  | valid
  v
persist-validated-report (Prisma service called outside or by controlled graph wrapper)
  |
  v
END
```

Invalid output may be retried once with validation feedback. Use bounded LLM/tool retries and explicit timeouts. If output remains invalid, return a structured failure status and a deterministic fallback report containing only verified numerical findings.

## 6.3 Investigation Agent responsibilities

Inputs:

- FC ID and business date.
- Revenue, six cost amounts and percentages.
- CM1 amount/percentage and CM2 amount/percentage.
- Exact target snapshot.
- Detected anomalies and deviation percentage points.
- Deterministically calculated cost-overrun impacts.
- Seven-day and thirty-day historical comparisons when available.
- Similar previous anomalies, investigations, and manager feedback when available.

The agent investigates what is numerically abnormal, what changed compared with historical performance, which cost lines contribute most, and what is still unknown.

Read-only tools (strict FC and date scope):

- `getFcHistoricalPerformance(fcId, businessDate, days)`
- `getCostLineTrend(fcId, lineItem, businessDate, days)`
- `getSimilarAnomalies(fcId, lineItem, businessDate)`
- `getPreviousInvestigations(fcId, lineItem, businessDate)`
- `getPriorResolutionFeedback(fcId, lineItem)`

Tools must query Prisma/repositories with authorization/FC scoping. Do not expose arbitrary SQL tools. Maximum three tool rounds per investigation run.

The agent must clearly distinguish:

- Confirmed numerical observations from current records.
- Historical patterns supported by retrieved data.
- Possible causes that are hypotheses.
- Questions that require operational evidence not present in the system.

Do not claim that power tariffs rose, overtime increased, staffing was inefficient, or equipment was overused unless actual source evidence exists.

## 6.4 Investigation output schema

Implement a strict Zod schema, with a result structurally equivalent to:

```ts
{
  summary: string,
  findings: Array<{
    findingId: string,
    anomalyId: string | null,
    lineItem: string,
    explanation: string,
    evidenceRefs: string[],
    confidence: "HIGH" | "MEDIUM" | "LOW"
  }>,
  possibleCauses: Array<{
    cause: string,
    supportingEvidenceRefs: string[],
    confidence: "HIGH" | "MEDIUM" | "LOW"
  }>,
  recurringIssue: boolean,
  unresolvedQuestions: string[]
}
```

Every evidence reference must correspond to an actual record/metric passed to the agent or returned by its tools. Reject unknown evidence references.

The LLM must not supply authoritative amounts, percentages, target values, or excess-cost values. The UI obtains those from persisted deterministic financial records. If prose includes numeric claims, they must be checked against supplied evidence or rewritten to avoid unsupported values.

## 6.5 Recommendation Agent responsibilities

Input:

- Validated Investigation Agent result.
- Financial facts and anomaly severity.
- Cost contributor ranking.
- Historical resolution feedback where available.

Output practical recommendations. Each recommendation must be connected to a finding ID and assigned to a plausible responsible team.

Teams:

- `FC_OPERATIONS`
- `FINANCE`
- `PROCUREMENT`
- `HR`
- `MANAGEMENT`

## 6.6 Recommendation output schema

```ts
{
  overallPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  managerSummary: string,
  recommendations: Array<{
    action: string,
    responsibleTeam:
      | "FC_OPERATIONS"
      | "FINANCE"
      | "PROCUREMENT"
      | "HR"
      | "MANAGEMENT",
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    reason: string,
    relatedFindingIds: string[]
  }>,
  requiresHumanReview: boolean
}
```

Reject recommendation references to unknown finding IDs. Recommendations are advisory; do not execute financial/operational changes automatically.

## 6.7 Prompts and provider

Keep prompts in versioned files, not inline strings hidden across services. Store `model`, `promptVersion`, graph thread ID, token usage if provided, latency, and validation result with the AI report or execution metadata.

Start with OpenAI. Put LLM construction behind a `ModelProvider` factory so Bedrock can be added later without changing the agents. Do not implement multiple providers in the first pass unless explicitly required.

Use temperature and structured output configuration suitable for consistent extraction/reasoning. Do not rely on free-form JSON parsing alone; validate with Zod.

## 6.8 Checkpointing vs business memory

Use LangGraph `PostgresSaver` if compatible with the chosen LangGraph.js release. It may use the same PostgreSQL server but should use a separate schema (e.g. `langgraph`) and separate connection pool from Prisma where appropriate.

- LangGraph checkpointer = workflow execution checkpoint/state.
- Prisma business tables = historical FC performance, anomalies, investigations, feedback and overrides.

Do not manually copy checkpoint blobs into business tables. Do not confuse checkpointing with historical business memory.

Use a deterministic, bounded thread ID, e.g.:

```text
margin:{fcId}:{businessDate}:{submissionId}
```

Never run email sending or other external side effects in a checkpointed graph node.

---

# 7. Historical memory, human feedback, and trends

## 7.1 Structured historical memory

No vector database is required. Use SQL queries over DailyPnL, CostLineItem, Anomaly, AIReport and review/feedback records.

Support:

- Previous 7-day average for every cost line.
- Previous 30-day average for every cost line.
- CM1/CM2 trend.
- Repeated breaches by FC and cost line.
- Similar anomaly history.
- Previous investigation summaries.
- Whether prior actions were accepted/resolved.

Historical comparisons must use only dates before the current business date. Exclude invalid, missing, or superseded submissions as appropriate. Clearly state the sample count and missing-data limitation.

## 7.2 Human review

Managers and Finance users can:

- Acknowledge an anomaly.
- Mark it resolved.
- Dismiss it with a required reason and permission.
- Add investigation notes.
- Mark a recommendation accepted/rejected/completed.
- Record resolution outcome and supporting note.

Do not allow a manual status change to rewrite raw financial values or target snapshots.

A genuine financial correction must be submitted as a new source-data version by an authorized user. Record who corrected it, the source file, reason, and previous version.

## 7.3 Trend tracking

Build daily and rolling trend queries. A sudden increase within the target band may be shown as contextual trend information, but it must not silently become a formal business-rule anomaly. Any future statistical early-warning rule must be explicitly configured, versioned, labelled separately, and tested.

---

# 8. Email architecture

## 8.1 Provider abstraction

Create a provider interface:

```ts
interface EmailProvider {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string | null }>;
}
```

Implement:

- `ResendEmailProvider` (default).
- `NodemailerEmailProvider` (SMTP alternative).
- `TestEmailProvider` (tests/development; captures messages without sending).

Select through `EMAIL_PROVIDER=resend|smtp|test`.

## 8.2 Delivery flow

After P&L/anomaly/AI persistence:

1. Resolve the FC manager and configured central recipients.
2. Create one `EmailOutbox` record per intended recipient or per digest according to the chosen recipient model.
3. Insert a `SEND_FC_DIGEST` BackgroundJob in the same DB transaction.
4. Worker loads the outbox and latest appropriate report version.
5. Render responsive HTML plus text alternative.
6. Send with provider.
7. Persist provider message ID, status, sent time, attempts and last error.

Never send email directly inside Express request handling or a LangGraph node.

## 8.3 Email content

A daily FC digest must include:

- Prozo branding.
- FC name/code and business date.
- Financial colour and meaning.
- Revenue.
- Six costs as amount and percentage of revenue.
- CM1 amount and percentage.
- CM2 amount and percentage.
- Each flagged anomaly: line item, actual %, target range, deviation pp, status, excess amount if above max.
- Top contributors sorted by monetary overrun.
- Investigation summary and evidence-based observations.
- Recommended actions, priority and responsible team.
- Link to authenticated anomaly/FC detail page.
- Generated timestamp and advisory disclaimer.

Missing-submission alerts are a separate template. Do not fabricate a P&L for missing/invalid data.

Send one consolidated digest per FC/date/submission version by default, not one email per anomaly. Central Finance recipients may be configured to receive a roll-up or CC/BCC policy; do not hardcode addresses.

## 8.4 Delivery guarantees

Do not claim exactly-once email delivery. Provider timeouts can occur after the provider has accepted a message. Use provider idempotency where supported, stable application idempotency keys, stored provider message IDs, and an `UNKNOWN`/reconciliation state for uncertain outcomes. For SMTP, use a stable Message-ID and application tracking but recognize SMTP's delivery semantics.

Retries must not cause financial analysis to rerun.

---

# 9. Database design — required models

Implement Prisma models and appropriate enums/relations. Names may follow the repository's naming conventions, but the following business entities and data must exist.

## 9.1 Users and FCs

### User

- id
- name
- email (unique)
- passwordHash
- role (`ADMIN`, `FINANCE`, `FC_MANAGER`)
- isActive
- createdAt, updatedAt

### FulfilmentCentre

- id
- code (unique)
- name
- location nullable
- currency
- isActive
- createdAt, updatedAt

### UserFulfilmentCentre

Explicit many-to-many assignment of FC managers to FCs.

## 9.2 Targets

### TargetRule

- id
- fcId nullable (null means global)
- metricKey
- minPct, maxPct as Decimal
- effectiveFrom date
- effectiveTo nullable date
- createdById
- createdAt

Create overlap validation for effective ranges. FC-specific rule takes precedence over global. Preserve old rules and snapshots.

## 9.3 Upload and source submissions

### UploadBatch

- id
- uploadedById
- mode (`CENTRALIZED`, `SINGLE_FC`)
- originalFileName
- bucket
- objectKey (unique)
- contentType
- fileSize
- checksum nullable
- status
- rowCount nullable
- validRowCount nullable
- invalidRowCount nullable
- errorSummary nullable JSON
- createdAt, completedAt

### DailySubmission

- id
- batchId nullable for missing placeholders or non-file sources
- fcId
- businessDate date-only
- version integer
- isLatest boolean
- status
- sourceRowIndex nullable
- rawInput JSONB/Prisma Json
- normalizedInput JSONB/Prisma Json when suitable, or typed columns if required
- errorDetails nullable
- createdAt, updatedAt

Unique `(fcId, businessDate, version)`. Enforce one latest version per `(fcId, businessDate)` using safe transaction logic and, if feasible, a PostgreSQL partial unique index migration.

## 9.4 Daily financial results

### DailyPnL

- id
- submissionId unique
- revenue Decimal
- currency
- manpowerCost Decimal
- packagingCost Decimal
- powerFuelCost Decimal
- fcRent Decimal
- equipmentRentals Decimal
- overheads Decimal
- six cost percentage Decimal columns, or normalized CostLineItem rows
- cm1 Decimal
- cm1Pct Decimal
- cm2 Decimal
- cm2Pct Decimal
- colour enum
- targetSnapshot JSON
- calculationVersion
- createdAt, updatedAt

### CostLineItem (recommended normalized detail)

- id
- dailyPnlId
- lineItem enum
- amount Decimal
- percentage Decimal
- targetMinPct Decimal nullable
- targetMaxPct Decimal nullable
- status enum (`IN_RANGE`, `BELOW_MIN`, `ABOVE_MAX`, `TARGET_NOT_CONFIGURED`)
- excessAmount Decimal nullable
- createdAt

Unique `(dailyPnlId, lineItem)`.

## 9.5 Anomalies and AI reports

### Anomaly

- id
- dailyPnlId
- type (`COST_BELOW_MIN`, `COST_ABOVE_MAX`, `CM1_DEVIATION`, `CM2_DEVIATION`, `SUSPICIOUS_HIGH_MARGIN`)
- metricKey
- actualPct Decimal
- targetMinPct Decimal nullable
- targetMaxPct Decimal nullable
- deviationPP Decimal nullable
- impactAmount Decimal nullable
- severity
- reviewStatus
- description
- createdAt, updatedAt

Avoid duplicate anomaly records per P&L, metric, anomaly type and calculation version.

### AIReport

- id
- dailyPnlId unique (or versioned report relation if AI-only regeneration history is retained)
- status (`PENDING`, `COMPLETED`, `FAILED`)
- investigation JSON
- recommendations JSON
- model
- promptVersion
- graphThreadId
- inputFingerprint
- generatedAt
- errorDetails nullable

Retain report versions or an AIReportRun history if re-running prompts is required. Do not overwrite audit history invisibly.

## 9.6 PostgreSQL job system

### BackgroundJob

Implement all fields in Section 5.2. Include `jobType`, JSON payload, status, priority, idempotencyKey, attempts/maxAttempts, availableAt, lock/lease fields, result and lastError.

### WorkerHeartbeat (optional)

- workerId unique
- processName
- lastSeenAt
- metadata JSON

Use this for operational monitoring and stale-worker detection.

## 9.7 Email, feedback and audits

### EmailOutbox

- id
- submissionId
- recipient
- subject
- htmlBody / template reference and serialized template data
- textBody
- status (`PENDING`, `SENDING`, `SENT`, `FAILED`, `UNKNOWN`)
- attempts
- providerMessageId nullable
- idempotencyKey unique
- lastError nullable
- sentAt nullable
- createdAt, updatedAt

Prefer storing template version and structured render data rather than duplicating large HTML if practical; still retain enough information for audit/debugging.

### AnomalyReview / ActionFeedback

Track actor, anomaly/report, action, reason/comment, status, outcome, timestamps. Keep this history append-only.

### AuditLog

Track actor, action, entity type/id, metadata JSON, timestamp. Do not delete audit logs when users or FCs are deactivated.

## 9.8 Database constraints and precision

- Monetary amounts: `Decimal(18,2)` or appropriate currency precision.
- Percentages/deviations: `Decimal(9,4)` or equivalent.
- Dates: PostgreSQL `DATE` for businessDate.
- Timestamps: timezone-aware.
- Index `(fcId, businessDate)` on submissions/results through relational indexes.
- Index status and availableAt on jobs.
- Index status/createdAt on email outbox.
- Foreign keys and deletion policies must preserve financial/audit history.
- Use soft deactivation rather than cascading deletion for FCs/users referenced by financial records.

---

# 10. REST API contracts

Use `/api/v1`. All request/response payloads must be Zod validated and documented with OpenAPI.

## 10.1 Authentication

```http
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

Use secure HttpOnly cookies, token rotation, password hashing (Argon2 or a well-maintained equivalent), rate limiting, CSRF protections appropriate to cookie auth, and secure cookie settings in production. Do not store auth tokens in localStorage.

## 10.2 Uploads

```http
POST /api/v1/uploads/initiate
POST /api/v1/uploads/:batchId/complete
GET  /api/v1/uploads/:batchId
GET  /api/v1/uploads/:batchId/submissions
GET  /api/v1/uploads/:batchId/errors
```

Initiate request example:

```json
{
  "fileName": "daily-fc-report.xlsx",
  "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "fileSize": 120000,
  "mode": "CENTRALIZED"
}
```

For single-FC mode require an authorized `fcId`. The upload initiation response includes `batchId`, presigned URL, required headers, and expiration. Never return S3 credentials.

## 10.3 Dashboard

```http
GET /api/v1/dashboard/summary?date=YYYY-MM-DD
GET /api/v1/dashboard/fc-status?date=YYYY-MM-DD
GET /api/v1/dashboard/trends?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Summary includes active FC count, received/missing/invalid submissions, counts by colour, total revenue, weighted CM1%, weighted CM2%, and anomaly count. Use weighted aggregate formulas.

## 10.4 FC data

```http
GET /api/v1/fcs
GET /api/v1/fcs/:fcId
GET /api/v1/fcs/:fcId/pnl?from=&to=
GET /api/v1/fcs/:fcId/anomalies?from=&to=
GET /api/v1/fcs/:fcId/trends?from=&to=
```

FC manager queries must be scoped to assigned FC IDs in backend service/repository logic. Do not rely on frontend hiding.

## 10.5 Anomaly and feedback

```http
GET   /api/v1/anomalies/:anomalyId
PATCH /api/v1/anomalies/:anomalyId/review
POST  /api/v1/anomalies/:anomalyId/notes
POST  /api/v1/recommendations/:id/feedback
```

Review statuses:

- `ACKNOWLEDGED`
- `DISMISSED`
- `RESOLVED`
- `NEEDS_INVESTIGATION`

Dismissal requires a reason and authorization. Store review changes as append-only events.

## 10.6 Target management

```http
GET   /api/v1/target-rules
POST  /api/v1/target-rules
PATCH /api/v1/target-rules/:id
```

Only ADMIN can manage target rules. Validate range consistency and effective dates. Do not mutate historical target snapshots.

## 10.7 Reprocessing

```http
POST /api/v1/submissions/:submissionId/reprocess
POST /api/v1/submissions/:submissionId/retry-ai
```

Only ADMIN/FINANCE can reprocess. Require reason. AI-only retry must not recalculate P&L or create duplicate anomalies. A corrected source workbook creates a new submission version.

## 10.8 Operational endpoints

```http
GET /health/live
GET /health/ready
GET /api/v1/admin/jobs?status=&type=
GET /api/v1/admin/jobs/:jobId
POST /api/v1/admin/jobs/:jobId/retry
```

Protect administrative job endpoints. Never expose stack traces or sensitive job payloads to ordinary users.

---

# 11. Frontend application requirements

Use Next.js App Router, TypeScript, Tailwind, a reusable accessible component system, React Hook Form + Zod for forms, a typed API client, and a consistent server-state strategy (TanStack Query or an equivalent approach).

## 11.1 Roles and navigation

Navigation:

- Dashboard
- Daily Uploads
- Fulfilment Centres
- Anomaly Reports
- Target Configuration (Admin only)
- User Management (Admin only)
- Settings

Show role-appropriate navigation, but enforce all access rules on the API.

## 11.2 Central dashboard

Show KPI cards:

- Active FCs.
- Submissions received.
- Missing submissions.
- Invalid submissions.
- Red, Yellow, Green, Blue FC counts.
- Total revenue.
- Weighted CM1% and CM2%.
- Open anomaly count.

Charts:

- Revenue trend.
- Weighted CM1/CM2 trend.
- Cost-line trend.
- FC comparison.

FC status table columns:

- FC code/name.
- Manager.
- Revenue.
- CM1%.
- CM2%.
- Anomaly count.
- Submission status.
- Colour.

Filters: business date, date range, FC, colour, submission status. A missing/invalid submission must not display as Green.

## 11.3 Upload page

- Drag-and-drop and file picker.
- Centralized and single-FC upload mode.
- Excel/CSV file type and size validation.
- Direct presigned S3 PUT upload.
- Upload progress.
- Completion callback.
- Batch status polling.
- Validation error report.
- Per-FC/date processing status.
- Retry/re-upload instructions.

Do not proxy the file through Express after implementing direct S3 upload.

## 11.4 Daily submission monitor

For a selected date, display every active FC and its status:

- MISSING
- RECEIVED
- VALIDATING
- QUEUED
- PROCESSING
- COMPLETED
- PARTIALLY_COMPLETED
- INVALID
- FAILED

This is separate from financial colour. It must be obvious when data has not arrived.

## 11.5 FC details

Show:

- FC identity and manager.
- Date range selection.
- Revenue.
- Six cost amounts and percentages.
- Target ranges.
- CM1 and CM2 amounts/percentages.
- Financial colour.
- Historical margin charts.
- Cost breakdown.
- Anomaly history.
- Submission/version information.

## 11.6 Anomaly detail

Show deterministic numerical evidence separately from AI-generated prose.

Sections:

1. Financial facts: actual, target, deviation, impact.
2. Investigation: summary, findings, evidence references, historical comparison, possible causes and confidence.
3. Recommendations: action, priority, team, reason.
4. Manager feedback/review timeline.
5. Source file and source row reference, subject to permissions.

Display `AI_PENDING`, `AI_FAILED`, or `AI_COMPLETED` accurately. Do not fabricate a report when AI failed.

## 11.7 Design quality

Build an enterprise operations/finance interface with:

- Responsive sidebar and header.
- Readable data tables.
- Clear severity indicators.
- Accessible contrast and non-colour text labels.
- Skeleton loading states.
- Empty/error states.
- Tooltips for CM1/CM2 and anomaly tolerances.
- Pagination and search.
- Toast feedback.
- Confirmations for destructive/irreversible actions.

Do not spend time generating decorative images. Prioritize information hierarchy and useful data visualizations.

---

# 12. Suggested repository structure

Use this structure unless the existing repository has a justified equivalent:

```text
prozo-margin-monitor/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── config/
│   │       ├── middleware/
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── users/
│   │       │   ├── fulfilment-centres/
│   │       │   ├── uploads/
│   │       │   ├── dashboard/
│   │       │   ├── anomalies/
│   │       │   ├── target-rules/
│   │       │   ├── feedback/
│   │       │   └── admin-jobs/
│   │       ├── routes/
│   │       ├── repositories/
│   │       ├── services/
│   │       ├── server.ts
│   │       └── app.ts
│   ├── worker/
│   │   └── src/
│   │       ├── config/
│   │       ├── db-jobs/
│   │       │   ├── claim-job.ts
│   │       │   ├── heartbeat.ts
│   │       │   ├── lease-reaper.ts
│   │       │   ├── retry-policy.ts
│   │       │   └── worker-runtime.ts
│   │       ├── handlers/
│   │       │   ├── process-upload.handler.ts
│   │       │   ├── analyze-submission.handler.ts
│   │       │   ├── generate-ai-report.handler.ts
│   │       │   ├── send-fc-digest.handler.ts
│   │       │   └── reconcile.handler.ts
│   │       ├── email/
│   │       └── main.ts
│   └── web/
│       └── src/
│           ├── app/
│           ├── components/
│           ├── features/
│           │   ├── dashboard/
│           │   ├── uploads/
│           │   ├── submissions/
│           │   ├── fulfilment-centres/
│           │   ├── pnl/
│           │   ├── anomalies/
│           │   ├── target-rules/
│           │   └── users/
│           ├── hooks/
│           ├── lib/
│           └── types/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── schemas/
│   │       ├── types/
│   │       └── constants/
│   ├── finance/
│   │   └── src/
│   │       ├── ingestion/
│   │       ├── calculations/
│   │       ├── targets/
│   │       ├── anomalies/
│   │       └── index.ts
│   └── ai/
│       └── src/
│           ├── graph/
│           ├── state/
│           ├── agents/
│           │   ├── investigation/
│           │   └── recommendation/
│           ├── tools/
│           ├── prompts/
│           ├── schemas/
│           ├── providers/
│           └── index.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── fixtures/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example
└── agent.md
```

---

# 13. Environment variables

Create a validated environment schema and `.env.example`. Do not commit real secrets.

```env
# Runtime
NODE_ENV=development
API_PORT=4000
WEB_URL=http://localhost:3000
API_URL=http://localhost:4000
BUSINESS_TIMEZONE=Asia/Kolkata

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prozo_margin

# S3
AWS_REGION=ap-south-1
AWS_S3_BUCKET=prozo-margin-monitor-dev
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false
S3_PRESIGNED_URL_TTL_SECONDS=600
MAX_UPLOAD_SIZE_BYTES=25000000

# Authentication
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
COOKIE_SECURE=false

# LLM
LLM_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=1

# Email
EMAIL_PROVIDER=test
EMAIL_FROM=Prozo Margin Monitor <alerts@example.com>
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=

# PostgreSQL job worker
WORKER_ID=
WORKER_POLL_INTERVAL_MS=1000
WORKER_CONCURRENCY=3
JOB_LEASE_SECONDS=120
JOB_HEARTBEAT_INTERVAL_SECONDS=30
JOB_MAX_ATTEMPTS=3
JOB_BASE_BACKOFF_MS=2000
JOB_MAX_BACKOFF_MS=300000

# LangGraph checkpointing (optional separate connection to same PG server/schema)
LANGGRAPH_DATABASE_URL=
LANGGRAPH_SCHEMA=langgraph
```

Use the AWS default credential chain in production (IAM role/task role). Avoid long-lived access keys in cloud deployments. If local credentials are used, keep them only in ignored `.env` files or AWS profiles.

---

# 14. Testing strategy and acceptance criteria

## 14.1 Financial unit tests

At minimum test:

- All six cost percentages.
- CM1 and CM1%.
- CM2 and CM2%.
- Decimal precision and display rounding.
- Zero/negative/missing revenue.
- Missing/unknown target configuration.
- Cost exact min/max boundaries.
- Cost above-max and below-min cases.
- Excess amount formula and contributor ordering.
- CM1 tolerance boundaries.
- CM2 tolerance boundaries.
- Exact FC colour boundaries.
- Green FC with cost anomaly.
- Yellow FC without CM2 deviation anomaly when inside tolerance envelope.
- Blue FC suspicious-high-margin path.

Expected CM2 boundary tests:

| CM2% | Colour |
|---:|---|
| 11.99 | RED |
| 12.00 | YELLOW |
| 14.99 | YELLOW |
| 15.00 | GREEN |
| 30.00 | GREEN |
| 30.01 | YELLOW |
| 33.00 | YELLOW |
| 33.01 | BLUE |

Expected CM1 anomaly boundary tests:

| CM1% | CM1 anomaly? |
|---:|---|
| 61.99 | Yes |
| 62.00 | No |
| 73.00 | No |
| 73.01 | Yes |

## 14.2 S3 tests

Test presigned upload initiation, missing object, HeadObject size mismatch, unsupported content, wrong ownership, repeated completion, S3 timeout, download failure, and private object access.

Use mocks for unit tests and MinIO or a dedicated test bucket for integration tests. MinIO is only a local S3-compatible test/development service; production uses AWS S3.

## 14.3 PostgreSQL worker tests

Test:

- Two workers cannot claim the same job concurrently.
- Expired lease recovery.
- Heartbeat extension.
- Lock-token fencing prevents stale completion.
- Retry/backoff and max-attempt terminal failure.
- Permanent vs retryable error handling.
- Duplicate idempotency key rejection.
- Transactional creation of job with source business record.
- Worker graceful shutdown.
- Database disconnect/reconnect.
- Reconciliation of stuck/missing jobs.

Use real PostgreSQL integration tests for `SKIP LOCKED` and lease behaviour. Mocks alone are insufficient for concurrency correctness.

## 14.4 LangGraph tests

Mock the LLM provider for deterministic tests. Test both agents separately and as a full graph:

- Investigation success.
- Tool calls and tool limits.
- FC scoping.
- Historical context with missing days.
- Invalid output and bounded retry.
- Unsupported evidence reference rejected.
- Recommendation references valid findings.
- LLM timeout.
- AI failure does not roll back P&L.
- AI-only reprocessing does not duplicate financial results.
- Blue status investigation.
- No-AI branch for normal FC.

## 14.5 Email tests

Test all colour templates, missing-submission notice, manager recipient resolution, Resend provider (mock), Nodemailer SMTP adapter (mock/test SMTP), idempotency key persistence, timeout/UNKNOWN state, retry, and no email duplicate on analysis retry.

## 14.6 End-to-end scenario

Create clearly labelled fixture data for at least five FCs:

1. Green FC with no cost-line anomalies.
2. Red FC with two cost-line overruns.
3. Yellow FC with a cost-line anomaly but CM2 inside the tolerance envelope.
4. Blue FC with suspiciously high margin.
5. An expected FC with missing data.

Use actual case-study targets if the workbook is available. Otherwise the development fixture may use explicitly labelled illustrative targets, never production defaults.

Execute the real flow:

1. Log in as Finance.
2. Initiate upload.
3. Upload file directly to S3/MinIO.
4. Complete upload.
5. Observe `PROCESS_UPLOAD` job in PostgreSQL.
6. Worker downloads and parses workbook.
7. Per-FC/date submissions are created.
8. Financial calculations and anomalies are persisted.
9. Investigation and Recommendation agents run for relevant FCs.
10. Validated AI report is persisted.
11. EmailOutbox and send job are created transactionally.
12. Test email provider captures per-FC digest.
13. Dashboard shows correct FC statuses, missing data and weighted margins.
14. FC Manager sees only assigned FCs.

## 14.7 Security acceptance

- FC Manager cannot access another FC by changing URL/query/body IDs.
- Finance cannot change target rules unless explicitly authorized.
- Admin routes are protected.
- S3 objects are private.
- Presigned URL is short-lived.
- Auth tokens are not stored in localStorage.
- File content is untrusted and cannot override agent instructions.
- LLM tools cannot access other FCs or arbitrary SQL.
- No secrets appear in logs, payloads, source maps, prompts, or frontend builds.
- Original records and audit history are preserved.

## 14.8 Final acceptance gate

Do not claim completion until all are true:

- API starts and health checks pass.
- Worker starts and claims PostgreSQL jobs.
- Frontend starts and authenticates.
- Prisma migrations apply to a clean database.
- S3 upload and completion flow work.
- XLSX/CSV ingestion works.
- Financial unit tests pass.
- PostgreSQL concurrency/lease integration tests pass.
- Both LangGraph agents execute through a test anomaly.
- AI outputs are validated and persisted.
- Email delivery is exercised through the test provider and provider adapter tests.
- Dashboard uses persisted API data, not mock arrays.
- FC authorization tests pass.
- README describes the implementation that actually exists.

---

# 15. README requirements

Create a useful root `README.md` containing:

1. Problem statement and business objective.
2. Architecture and Mermaid diagram.
3. Centralized and single-FC upload modes.
4. S3 bucket setup, CORS, encryption, IAM and presigned upload flow.
5. PostgreSQL setup and Prisma migrations.
6. PostgreSQL-backed worker architecture, `SKIP LOCKED`, leases, retries and recovery.
7. Financial formulas, target rules, tolerance envelope and FC colour rules.
8. LangGraph workflow with exactly two agents.
9. Historical memory and human feedback.
10. Resend and Nodemailer setup.
11. Environment variables.
12. Local Docker/MinIO instructions.
13. How to run API, web and worker independently.
14. Seed/demo data instructions.
15. Tests and end-to-end workflow.
16. Security and operational limitations.
17. Future improvements (ERP integration, operational evidence, forecasting, statistical early warnings).

Include exact working commands. Never document a command or feature that has not been implemented.

---

# 16. Implementation prompts — execute in order

The coding editor must use this section as its execution plan. Do not implement everything in one giant edit. Complete each prompt, run its checks, and proceed.

## PROMPT 0 — Repository inspection and implementation plan

Read `agent.md` completely. Inspect the repository, existing source files, package manager, Node version, and any supplied case-study files. If `Case Study 3.xlsx` exists, inspect every relevant worksheet, headers, target ranges, and sample rows. Do not assume a sheet layout.

Create a `IMPLEMENTATION_STATUS.md` checklist mapped to Sections 1–15 of this file. Identify existing code to retain, missing components, package/version risks, and implementation order. Do not generate the entire application yet. Do not ask the user to repeat architecture choices already specified. If the workbook is absent, explicitly record that target ranges remain configurable and are not known.

## PROMPT 1 — Monorepo foundation and local development environment

Implement the pnpm monorepo and folder structure in Sections 2 and 12. Initialize the Next.js frontend, Express API, independent worker application, and shared/finance/AI packages. Configure strict TypeScript, ESLint, Prettier, shared aliases, environment validation, Pino logging, request IDs, Express error handling, health endpoints, and graceful process shutdown.

Create Docker Compose for PostgreSQL and optional MinIO. Do not include Redis. Add root scripts to run API, web, worker, lint, typecheck, tests, and formatting. Run the services and verify their basic health before continuing.

## PROMPT 2 — Prisma schema, migrations, and seed data

Implement every required database model from Sections 9 and 5. Include users, FCs, assignments, effective-dated targets, uploads, submissions, P&L, cost lines, anomalies, AI reports, PostgreSQL BackgroundJob, email outbox, manual review/feedback, audit log, and worker heartbeat if useful.

Use Decimal, date-only business dates, required indexes, foreign keys and unique constraints. Create migrations and a seed script. Seed users/FCs with safe development credentials from environment variables. Do not invent the workbook's target ranges. Run migrations against a clean PostgreSQL instance, generate Prisma Client, run schema validation, and add repository tests.

## PROMPT 3 — S3 storage and upload APIs

Implement the S3 module in Section 4. Use AWS SDK v3. Add upload initiation, presigned PUT URL generation, object verification via HeadObject, and upload completion. Persist batch metadata. In the same PostgreSQL transaction that marks an upload verified, insert a PROCESS_UPLOAD BackgroundJob. Implement direct-to-S3 frontend upload later; for now verify backend contracts with tests and MinIO integration. Enforce private storage and least privilege. Do not proxy actual file bytes through the API in the final frontend flow.

## PROMPT 4 — Spreadsheet parsing and deterministic financial engine

Implement ExcelJS/CSV ingestion, configurable header mapping, normalization, validation, row-level errors, duplicate handling, FC/date grouping and target resolution. Inspect the actual workbook if available. Implement all calculations/anomaly/colour rules in Section 3 using Decimal arithmetic. Persist immutable DailySubmission versions and P&L/cost-line/anomaly results. Add extensive unit tests for every boundary. Do not invoke the LLM in this phase.

## PROMPT 5 — PostgreSQL-backed worker and job reliability

Implement the BackgroundJob queue and worker runtime in Section 5. Use raw PostgreSQL claim SQL with `FOR UPDATE SKIP LOCKED`, short claim transactions, lease tokens, heartbeat, lease expiry recovery, retries/backoff/jitter, terminal failure handling, job progress, graceful shutdown and reconciliation. Implement PROCESS_UPLOAD handler end to end. Implement ANALYZE_SUBMISSION handler for deterministic financial analysis. Schedule dependent jobs in the same PostgreSQL transaction as the records they depend on. Do not install Redis/BullMQ or any other broker. Add real PostgreSQL concurrency tests with multiple worker instances.

## PROMPT 6 — LangGraph two-agent workflow

Implement Section 6 in `packages/ai`. The graph must contain exactly two LLM-powered agents: Investigation and Recommendation. Add typed state, provider adapter, versioned prompts, Zod schemas, read-only historical tools scoped to current FC, tool limits, output validation, bounded retries, deterministic fallback, and PostgresSaver checkpointing if compatible. Keep financial facts authoritative in PostgreSQL and never let LLM output alter calculations. Add mock-LLM unit/integration tests. Add an AI-only retry job that does not recalculate P&L.

## PROMPT 7 — Email providers and asynchronous digest delivery

Implement Section 8. Add Resend default, Nodemailer SMTP alternative, and test email provider. Create responsive HTML/text digest templates for Red/Yellow/Green/Blue and a separate missing-submission notification. After P&L/AI report persistence, create EmailOutbox and SEND_FC_DIGEST BackgroundJob in one transaction. Implement the email job handler, idempotency tracking, provider message IDs, bounded retries and UNKNOWN state for uncertain delivery. Add tests. Never send email from API request handling or LangGraph nodes.

## PROMPT 8 — Authentication, authorization and REST APIs

Implement Section 10. Add login/logout/refresh/me, secure cookie/session handling, password hashing, RBAC, FC assignment scope, upload endpoints, dashboard endpoints, FC/P&L/anomaly APIs, target management, review/feedback and reprocessing APIs. Add Zod request/response schemas and OpenAPI documentation. Ensure all FC access is filtered in the backend. Add authorization integration tests for Admin, Finance and FC Manager.

## PROMPT 9 — Next.js application and real dashboard

Implement Section 11. Build the login flow, responsive shell, central dashboard, upload flow using direct presigned S3 PUT, batch/FC submission monitor, FC detail/P&L page, anomaly investigation page, target management and user management. Connect all screens to real backend endpoints. Add loading, error, empty and unauthorized states. Show missing/invalid submissions separately from financial colours. Use weighted aggregate CM percentages. Do not use mock business data in production pages. Add Playwright smoke tests.

## PROMPT 10 — End-to-end testing and demonstration scenario

Implement the complete end-to-end scenario from Section 14. Add fixtures for Green, Red, Yellow, Blue and missing FC cases. Use actual workbook targets if available; otherwise explicitly label development targets illustrative. Exercise the real browser upload -> S3 -> PostgreSQL job -> worker -> P&L/anomaly -> LangGraph -> PostgreSQL -> email test provider -> dashboard flow. Add tests for worker crash, lease recovery, duplicate submission, duplicate email job, AI provider timeout, and S3 failure. Fix defects rather than suppressing failing tests.

## PROMPT 11 — README, operational hardening, and final architecture audit

Complete Sections 13–15. Review source against the entire `agent.md`. Check secrets, permissions, input validation, S3 privacy, Decimal usage, job idempotency, lease fencing, prompt injection, FC-level authorization, email retry semantics and historical audit preservation. Run migrations on a clean DB, lint, typecheck, all tests, build frontend/API/worker, and run the E2E scenario. Update README and IMPLEMENTATION_STATUS.md. Produce a final report with completed features, exact commands run, test outcomes and known blockers. Do not claim success for any unverified feature.

---

# 17. Final non-negotiable rules

1. PostgreSQL is the only job queue backend. No Redis. No BullMQ.
2. S3 is private and stores original uploaded files. Browser uploads use presigned URLs.
3. Prisma manages application/business database records.
4. The worker claims PostgreSQL jobs with `FOR UPDATE SKIP LOCKED`, leases, heartbeat, fencing tokens and retries.
5. Financial calculations and business-rule detection are deterministic and independently tested.
6. The only LLM agents are Investigation Agent and Recommendation Agent.
7. Investigation uses read-only, FC-scoped historical tools and evidence references.
8. Recommendation actions must be linked to validated investigation findings.
9. LLM output never changes authoritative financial figures, target rules, or operational systems.
10. Email is delivered asynchronously from an outbox/job and cannot cause financial results to be recalculated.
11. Missing or invalid data is never treated as healthy/Green.
12. Corrections, target changes, manager decisions and AI report versions remain auditable.
13. The dashboard uses persisted API data, not hardcoded mock results.
14. Do not fabricate workbook target ranges or claim that unimplemented integrations work.
15. The final deliverable is a working end-to-end prototype with tests and an accurate README—not merely a generated code scaffold.

**Begin with PROMPT 0.**
