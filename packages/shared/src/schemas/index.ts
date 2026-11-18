import { z } from 'zod';
import {
  UPLOAD_MODES,
  REVIEW_STATUSES,
  RESPONSIBLE_TEAMS,
  SEVERITIES
} from '../constants/index.js';

// --- Environment Schema ---
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:4000'),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().default('prozo-margin-monitor-dev'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().optional().transform(v => (v && v.trim() !== '' ? v.trim() : undefined)),
  AWS_S3_FORCE_PATH_STYLE: z.string().transform(v => v === 'true').default('false'),
  S3_PRESIGNED_URL_TTL_SECONDS: z.coerce.number().default(600),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().default(25_000_000),
  JWT_ACCESS_SECRET: z.string().default('default-access-secret-minimum-32-chars-long'),
  JWT_REFRESH_SECRET: z.string().default('default-refresh-secret-minimum-32-chars-long'),
  COOKIE_SECURE: z.string().transform(v => v === 'true').default('false'),
  LLM_PROVIDER: z.enum(['groq', 'openai', 'mock']).default('groq'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().default(1),

  // LangSmith Tracing
  LANGCHAIN_TRACING_V2: z.string().transform(v => v === 'true').default('false'),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().default('prozo-fc-margin-monitor'),
  LANGCHAIN_ENDPOINT: z.string().default('https://api.smith.langchain.com'),
  LANGSMITH_TRACING: z.string().transform(v => v === 'true').default('false'),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  LANGSMITH_ENDPOINT: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'test']).default('test'),
  EMAIL_FROM: z.string().default('Prozo Margin Monitor <alerts@example.com>'),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  WORKER_ID: z.string().default('worker-1'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  WORKER_CONCURRENCY: z.coerce.number().default(3),
  JOB_LEASE_SECONDS: z.coerce.number().default(120),
  JOB_HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().default(30),
  JOB_MAX_ATTEMPTS: z.coerce.number().default(3),
  JOB_BASE_BACKOFF_MS: z.coerce.number().default(2000),
  JOB_MAX_BACKOFF_MS: z.coerce.number().default(300000),
  LANGGRAPH_DATABASE_URL: z.string().optional(),
  LANGGRAPH_SCHEMA: z.string().default('langgraph')
});

export type EnvConfig = z.infer<typeof envSchema>;

// --- Raw Ingestion Input Schema ---
export const dailyFCInputSchema = z.object({
  fcId: z.string().min(1, 'FC ID is required'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD'),
  currency: z.string().default('INR'),
  revenue: z.string().refine(val => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Revenue must be a positive number'
  }),
  manpowerCost: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Manpower cost must be a non-negative number'
  }),
  packagingCost: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Packaging cost must be a non-negative number'
  }),
  powerFuelCost: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Power & Fuel cost must be a non-negative number'
  }),
  fcRent: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'FC Rent must be a non-negative number'
  }),
  equipmentRentals: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Equipment Rentals must be a non-negative number'
  }),
  overheads: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Overheads must be a non-negative number'
  }),
  sourceRowIndex: z.number().int().nonnegative()
});

export type DailyFCInput = z.infer<typeof dailyFCInputSchema>;

// --- Auth Schemas ---
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// --- Upload Initiation & Completion Schemas ---
export const initiateUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().positive(),
  mode: z.enum(UPLOAD_MODES).default('CENTRALIZED'),
  fcId: z.string().optional()
});

export type InitiateUploadRequest = z.infer<typeof initiateUploadRequestSchema>;

// --- AI Output Schemas ---
export const findingSchema = z.object({
  findingId: z.string(),
  anomalyId: z.string().nullable(),
  lineItem: z.string(),
  explanation: z.string(),
  evidenceRefs: z.array(z.string()),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'])
});

export const possibleCauseSchema = z.object({
  cause: z.string(),
  supportingEvidenceRefs: z.array(z.string()),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'])
});

export const investigationOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(findingSchema),
  possibleCauses: z.array(possibleCauseSchema),
  recurringIssue: z.boolean(),
  unresolvedQuestions: z.array(z.string())
});

export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;

export const recommendationItemSchema = z.object({
  action: z.string(),
  responsibleTeam: z.enum(RESPONSIBLE_TEAMS),
  priority: z.enum(SEVERITIES),
  reason: z.string(),
  relatedFindingIds: z.array(z.string())
});

export const recommendationOutputSchema = z.object({
  overallPriority: z.enum(SEVERITIES),
  managerSummary: z.string(),
  recommendations: z.array(recommendationItemSchema),
  requiresHumanReview: z.boolean()
});

export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

// --- Background Job Payload Schemas ---
export const processUploadPayloadSchema = z.object({
  batchId: z.string().uuid()
});

export const analyzeSubmissionPayloadSchema = z.object({
  submissionId: z.string().uuid()
});

export const generateAIReportPayloadSchema = z.object({
  submissionId: z.string().uuid(),
  force: z.boolean().optional()
});

export const sendFCDigestPayloadSchema = z.object({
  emailOutboxId: z.string().uuid()
});

export const sendMissingAlertPayloadSchema = z.object({
  submissionId: z.string().uuid()
});

export const reconcileStaleWorkPayloadSchema = z.object({
  timestamp: z.string().optional()
});

// --- Review & Feedback Schemas ---
export const anomalyReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  reason: z.string().optional(),
  comment: z.string().optional()
});

export const actionFeedbackSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'COMPLETED']),
  outcomeNote: z.string().min(1)
});

// --- Target Rule Schema ---
export const createTargetRuleSchema = z.object({
  fcId: z.string().uuid().nullable().optional(),
  metricKey: z.string().min(1),
  minPct: z.string().refine(val => !isNaN(Number(val))),
  maxPct: z.string().refine(val => !isNaN(Number(val))),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});
