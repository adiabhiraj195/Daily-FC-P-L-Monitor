"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTargetRuleSchema = exports.actionFeedbackSchema = exports.anomalyReviewSchema = exports.reconcileStaleWorkPayloadSchema = exports.sendMissingAlertPayloadSchema = exports.sendFCDigestPayloadSchema = exports.generateAIReportPayloadSchema = exports.analyzeSubmissionPayloadSchema = exports.processUploadPayloadSchema = exports.recommendationOutputSchema = exports.recommendationItemSchema = exports.investigationOutputSchema = exports.possibleCauseSchema = exports.findingSchema = exports.initiateUploadRequestSchema = exports.loginRequestSchema = exports.dailyFCInputSchema = exports.envSchema = void 0;
const zod_1 = require("zod");
const index_js_1 = require("../constants/index.js");
// --- Environment Schema ---
exports.envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: zod_1.z.coerce.number().default(4000),
    WEB_URL: zod_1.z.string().default('http://localhost:3000'),
    API_URL: zod_1.z.string().default('http://localhost:4000'),
    BUSINESS_TIMEZONE: zod_1.z.string().default('Asia/Kolkata'),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required'),
    AWS_REGION: zod_1.z.string().default('ap-south-1'),
    AWS_S3_BUCKET: zod_1.z.string().default('prozo-margin-monitor-dev'),
    AWS_ACCESS_KEY_ID: zod_1.z.string().optional(),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    AWS_S3_ENDPOINT: zod_1.z.string().optional(),
    AWS_S3_FORCE_PATH_STYLE: zod_1.z.string().transform(v => v === 'true').default('false'),
    S3_PRESIGNED_URL_TTL_SECONDS: zod_1.z.coerce.number().default(600),
    MAX_UPLOAD_SIZE_BYTES: zod_1.z.coerce.number().default(25_000_000),
    JWT_ACCESS_SECRET: zod_1.z.string().default('default-access-secret-minimum-32-chars-long'),
    JWT_REFRESH_SECRET: zod_1.z.string().default('default-refresh-secret-minimum-32-chars-long'),
    COOKIE_SECURE: zod_1.z.string().transform(v => v === 'true').default('false'),
    LLM_PROVIDER: zod_1.z.enum(['openai', 'mock']).default('openai'),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    OPENAI_MODEL: zod_1.z.string().default('gpt-4o-mini'),
    LLM_TIMEOUT_MS: zod_1.z.coerce.number().default(30000),
    LLM_MAX_RETRIES: zod_1.z.coerce.number().default(1),
    EMAIL_PROVIDER: zod_1.z.enum(['resend', 'smtp', 'test']).default('test'),
    EMAIL_FROM: zod_1.z.string().default('Prozo Margin Monitor <alerts@example.com>'),
    RESEND_API_KEY: zod_1.z.string().optional(),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().default(587),
    SMTP_SECURE: zod_1.z.string().transform(v => v === 'true').default('false'),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    WORKER_ID: zod_1.z.string().default('worker-1'),
    WORKER_POLL_INTERVAL_MS: zod_1.z.coerce.number().default(1000),
    WORKER_CONCURRENCY: zod_1.z.coerce.number().default(3),
    JOB_LEASE_SECONDS: zod_1.z.coerce.number().default(120),
    JOB_HEARTBEAT_INTERVAL_SECONDS: zod_1.z.coerce.number().default(30),
    JOB_MAX_ATTEMPTS: zod_1.z.coerce.number().default(3),
    JOB_BASE_BACKOFF_MS: zod_1.z.coerce.number().default(2000),
    JOB_MAX_BACKOFF_MS: zod_1.z.coerce.number().default(300000),
    LANGGRAPH_DATABASE_URL: zod_1.z.string().optional(),
    LANGGRAPH_SCHEMA: zod_1.z.string().default('langgraph')
});
// --- Raw Ingestion Input Schema ---
exports.dailyFCInputSchema = zod_1.z.object({
    fcId: zod_1.z.string().min(1, 'FC ID is required'),
    businessDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD'),
    currency: zod_1.z.string().default('INR'),
    revenue: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) > 0, {
        message: 'Revenue must be a positive number'
    }),
    manpowerCost: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
        message: 'Manpower cost must be a non-negative number'
    }),
    packagingCost: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
        message: 'Packaging cost must be a non-negative number'
    }),
    powerFuelCost: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
        message: 'Power & Fuel cost must be a non-negative number'
    }),
    fcRent: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
        message: 'FC Rent must be a non-negative number'
    }),
    equipmentRentals: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
        message: 'Equipment Rentals must be a non-negative number'
    }),
    overheads: zod_1.z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
        message: 'Overheads must be a non-negative number'
    }),
    sourceRowIndex: zod_1.z.number().int().nonnegative()
});
// --- Auth Schemas ---
exports.loginRequestSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6)
});
// --- Upload Initiation & Completion Schemas ---
exports.initiateUploadRequestSchema = zod_1.z.object({
    fileName: zod_1.z.string().min(1),
    contentType: zod_1.z.string().min(1),
    fileSize: zod_1.z.number().positive(),
    mode: zod_1.z.enum(index_js_1.UPLOAD_MODES).default('CENTRALIZED'),
    fcId: zod_1.z.string().optional()
});
// --- AI Output Schemas ---
exports.findingSchema = zod_1.z.object({
    findingId: zod_1.z.string(),
    anomalyId: zod_1.z.string().nullable(),
    lineItem: zod_1.z.string(),
    explanation: zod_1.z.string(),
    evidenceRefs: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.enum(['HIGH', 'MEDIUM', 'LOW'])
});
exports.possibleCauseSchema = zod_1.z.object({
    cause: zod_1.z.string(),
    supportingEvidenceRefs: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.enum(['HIGH', 'MEDIUM', 'LOW'])
});
exports.investigationOutputSchema = zod_1.z.object({
    summary: zod_1.z.string(),
    findings: zod_1.z.array(exports.findingSchema),
    possibleCauses: zod_1.z.array(exports.possibleCauseSchema),
    recurringIssue: zod_1.z.boolean(),
    unresolvedQuestions: zod_1.z.array(zod_1.z.string())
});
exports.recommendationItemSchema = zod_1.z.object({
    action: zod_1.z.string(),
    responsibleTeam: zod_1.z.enum(index_js_1.RESPONSIBLE_TEAMS),
    priority: zod_1.z.enum(index_js_1.SEVERITIES),
    reason: zod_1.z.string(),
    relatedFindingIds: zod_1.z.array(zod_1.z.string())
});
exports.recommendationOutputSchema = zod_1.z.object({
    overallPriority: zod_1.z.enum(index_js_1.SEVERITIES),
    managerSummary: zod_1.z.string(),
    recommendations: zod_1.z.array(exports.recommendationItemSchema),
    requiresHumanReview: zod_1.z.boolean()
});
// --- Background Job Payload Schemas ---
exports.processUploadPayloadSchema = zod_1.z.object({
    batchId: zod_1.z.string().uuid()
});
exports.analyzeSubmissionPayloadSchema = zod_1.z.object({
    submissionId: zod_1.z.string().uuid()
});
exports.generateAIReportPayloadSchema = zod_1.z.object({
    submissionId: zod_1.z.string().uuid(),
    force: zod_1.z.boolean().optional()
});
exports.sendFCDigestPayloadSchema = zod_1.z.object({
    emailOutboxId: zod_1.z.string().uuid()
});
exports.sendMissingAlertPayloadSchema = zod_1.z.object({
    submissionId: zod_1.z.string().uuid()
});
exports.reconcileStaleWorkPayloadSchema = zod_1.z.object({
    timestamp: zod_1.z.string().optional()
});
// --- Review & Feedback Schemas ---
exports.anomalyReviewSchema = zod_1.z.object({
    status: zod_1.z.enum(index_js_1.REVIEW_STATUSES),
    reason: zod_1.z.string().optional(),
    comment: zod_1.z.string().optional()
});
exports.actionFeedbackSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACCEPTED', 'REJECTED', 'COMPLETED']),
    outcomeNote: zod_1.z.string().min(1)
});
// --- Target Rule Schema ---
exports.createTargetRuleSchema = zod_1.z.object({
    fcId: zod_1.z.string().uuid().nullable().optional(),
    metricKey: zod_1.z.string().min(1),
    minPct: zod_1.z.string().refine(val => !isNaN(Number(val))),
    maxPct: zod_1.z.string().refine(val => !isNaN(Number(val))),
    effectiveFrom: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveTo: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});
//# sourceMappingURL=index.js.map