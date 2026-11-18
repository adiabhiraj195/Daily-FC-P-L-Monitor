import { z } from 'zod';
import {
  UPLOAD_MODES,
  REVIEW_STATUSES,
  RESPONSIBLE_TEAMS,
  SEVERITIES,
  DATASET_TYPES,
  DIAGNOSTIC_STATUSES,
  FINDING_CLASSIFICATIONS,
  CONFIDENCE_LEVELS
} from '../constants/index';

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

// --- Operational & Workforce Input Schemas ---
export const dailyOperationsInputSchema = z.object({
  fcId: z.string().min(1, 'FC ID is required'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD'),
  inboundShipments: z.number().int({ message: 'Inbound shipments must be an integer' }).nonnegative({ message: 'Inbound shipments must be non-negative' }),
  outboundOrders: z.number().int({ message: 'Outbound orders must be an integer' }).nonnegative({ message: 'Outbound orders must be non-negative' }),
  unitsProcessed: z.number().int({ message: 'Units processed must be an integer' }).nonnegative({ message: 'Units processed must be non-negative' }),
  orderLinesProcessed: z.number().int({ message: 'Order lines processed must be an integer' }).nonnegative({ message: 'Order lines processed must be non-negative' }),
  returnsProcessed: z.number().int({ message: 'Returns processed must be an integer' }).nonnegative({ message: 'Returns processed must be non-negative' }),
  operatingHours: z.number().nonnegative({ message: 'Operating hours must be non-negative' }),
  storageOccupancyPct: z.number().min(0, 'Storage occupancy cannot be negative').max(100, 'Storage occupancy cannot exceed 100%').nullable(),
  sourceRowIndex: z.number().int().nonnegative().optional()
});

export const dailyLaborInputSchema = z.object({
  fcId: z.string().min(1, 'FC ID is required'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD'),
  plannedHeadcount: z.number().int({ message: 'Planned headcount must be an integer' }).nonnegative({ message: 'Planned headcount must be non-negative' }),
  actualHeadcount: z.number().int({ message: 'Actual headcount must be an integer' }).nonnegative({ message: 'Actual headcount must be non-negative' }),
  plannedLabourHours: z.number().nonnegative({ message: 'Planned labour hours must be non-negative' }),
  actualPaidHours: z.number().nonnegative({ message: 'Actual paid hours must be non-negative' }),
  productiveHours: z.number().nonnegative({ message: 'Productive hours must be non-negative' }),
  overtimeHours: z.number().nonnegative({ message: 'Overtime hours must be non-negative' }),
  contractorHeadcount: z.number().int({ message: 'Contractor headcount must be an integer' }).nonnegative({ message: 'Contractor headcount must be non-negative' }),
  contractorHours: z.number().nonnegative({ message: 'Contractor hours must be non-negative' }),
  contractorCost: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Contractor cost must be a non-negative number'
  }),
  sourceRowIndex: z.number().int().nonnegative().optional()
}).superRefine((data, ctx) => {
  if (data.productiveHours > data.actualPaidHours) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['productiveHours'],
      message: `Productive hours (${data.productiveHours}) cannot exceed actual paid hours (${data.actualPaidHours})`
    });
  }
  if (data.overtimeHours > data.actualPaidHours) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['overtimeHours'],
      message: `Overtime hours (${data.overtimeHours}) cannot exceed actual paid hours (${data.actualPaidHours})`
    });
  }
  if (data.contractorHours > data.actualPaidHours) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contractorHours'],
      message: `Contractor hours (${data.contractorHours}) cannot exceed actual paid hours (${data.actualPaidHours})`
    });
  }
});

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
  datasetType: z.enum(DATASET_TYPES).default('PNL'),
  fcId: z.string().optional()
});

export type InitiateUploadRequest = z.infer<typeof initiateUploadRequestSchema>;

// --- AI Output Schemas ---
export const investigationFindingEvidenceSchema = z.object({
  metric: z.string(),
  currentValue: z.number().nullable(),
  baselineValue: z.number().nullable(),
  difference: z.number().nullable(),
  unit: z.string(),
  source: z.string(),
  businessDate: z.string()
});

export const possibleCauseSchema = z.object({
  cause: z.string(),
  supportingEvidenceRefs: z.array(z.string()),
  confidence: z.enum(CONFIDENCE_LEVELS)
});

export const investigationFindingSchema = z.object({
  findingId: z.string(),
  anomalyId: z.string().nullable().default(null),
  title: z.string().default(''),
  explanation: z.string(),
  classification: z.enum(FINDING_CLASSIFICATIONS).default('OBSERVED_FACT'),
  evidenceRefs: z.array(z.string()).default([]),
  confidence: z.enum(CONFIDENCE_LEVELS).default('HIGH'),
  evidence: z.array(investigationFindingEvidenceSchema).optional().default([]),
  lineItem: z.string().optional()
}).transform(val => {
  const lineItem = val.lineItem || (val.evidence && val.evidence.length > 0 ? val.evidence[0]!.metric : (val.evidenceRefs[0] || 'METRIC'));
  const title = val.title || `${lineItem} Analysis`;
  const evidenceRefs = val.evidenceRefs.length > 0
    ? val.evidenceRefs
    : (val.evidence ? val.evidence.map(e => e.metric) : []);
  return {
    ...val,
    title,
    lineItem,
    evidenceRefs
  };
});

export const findingSchema = investigationFindingSchema;

export const investigationResultSchema = z.object({
  summary: z.string(),
  diagnosticStatus: z.enum(DIAGNOSTIC_STATUSES).default('COMPLETE'),
  findings: z.array(investigationFindingSchema).max(5),
  dataGaps: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
  recurringIssue: z.boolean().default(false),
  possibleCauses: z.array(possibleCauseSchema).optional().default([])
});

export const investigationOutputSchema = investigationResultSchema;
export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;

export const recommendationItemSchema = z.object({
  action: z.string(),
  responsibleTeam: z.enum(RESPONSIBLE_TEAMS),
  priority: z.enum(SEVERITIES),
  supportingFindingIds: z.array(z.string()).default([]),
  rationale: z.string().default(''),
  expectedOutcome: z.string().default(''),
  successMetric: z.string().default(''),
  reviewAfterDays: z.number().int().positive().default(7),
  expectedSavingINR: z.string().nullable().default(null),
  requiresHumanApproval: z.boolean().default(true),
  reason: z.string().optional(),
  relatedFindingIds: z.array(z.string()).optional()
}).transform(val => {
  const rationale = val.rationale || val.reason || 'Operational corrective action.';
  const reason = val.reason || rationale;
  const supportingFindingIds = val.supportingFindingIds.length > 0 ? val.supportingFindingIds : (val.relatedFindingIds || []);
  const relatedFindingIds = val.relatedFindingIds || supportingFindingIds;
  return {
    ...val,
    rationale,
    reason,
    supportingFindingIds,
    relatedFindingIds
  };
});

export const recommendationResultSchema = z.object({
  overallPriority: z.enum(SEVERITIES),
  managerSummary: z.string(),
  recommendations: z.array(recommendationItemSchema),
  requiresHumanReview: z.boolean().default(true)
});

export const recommendationOutputSchema = recommendationResultSchema;
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

// --- User Management & RBAC Schemas ---
export const newFCSchema = z.object({
  code: z.string().min(2, 'FC code is required (e.g. FC-PUN-01)').toUpperCase(),
  name: z.string().min(2, 'FC name is required'),
  location: z.string().optional(),
  currency: z.string().default('INR')
});

export const createManagerRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['FC_MANAGER', 'FINANCE', 'ADMIN']).default('FC_MANAGER'),
  fcId: z.string().optional(),
  newFC: newFCSchema.optional()
});

export const createFCRequestSchema = newFCSchema;

export const investigationContextSchema = z.object({
  fcId: z.string(),
  businessDate: z.string(),
  dataAvailability: z.object({
    pnl: z.boolean(),
    operations: z.boolean(),
    labor: z.boolean(),
    historical: z.boolean()
  }),
  financial: z.object({
    revenue: z.string(),
    cm1: z.string(),
    cm1Pct: z.string(),
    cm2: z.string(),
    cm2Pct: z.string(),
    colour: z.string(),
    costs: z.array(z.object({
      lineItem: z.string(),
      amount: z.string(),
      actualPct: z.string(),
      targetMinPct: z.string().nullable().optional(),
      targetMaxPct: z.string().nullable().optional(),
      status: z.string(),
      excessAmount: z.string().nullable().optional()
    }))
  }),
  anomalies: z.array(z.object({
    id: z.string(),
    metricKey: z.string(),
    type: z.string(),
    severity: z.string(),
    deviationFromTargetPP: z.string().nullable().optional(),
    breachBeyondTolerancePP: z.string().nullable().optional()
  })),
  operations: z.object({
    inboundShipments: z.number(),
    outboundOrders: z.number(),
    unitsProcessed: z.number(),
    orderLinesProcessed: z.number(),
    returnsProcessed: z.number(),
    operatingHours: z.number(),
    storageOccupancyPct: z.number().nullable().optional()
  }).nullable(),
  labor: z.object({
    plannedHeadcount: z.number(),
    actualHeadcount: z.number(),
    plannedHours: z.number(),
    paidHours: z.number(),
    productiveHours: z.number(),
    overtimeHours: z.number(),
    contractorHeadcount: z.number(),
    contractorHours: z.number(),
    contractorCost: z.string()
  }).nullable(),
  metrics: z.record(z.string(), z.number().nullable().optional()),
  reconciliation: z.object({
    status: z.string(),
    warnings: z.array(z.string()).default([]),
    contractorCostSharePct: z.number().nullable().optional(),
    contractorHourSharePct: z.number().nullable().optional(),
    contractorCostPerHour: z.number().nullable().optional(),
    nonContractorCostPerHour: z.number().nullable().optional(),
    signal: z.string().optional(),
    assumptions: z.array(z.string()).optional()
  }),
  history: z.object({
    available: z.boolean(),
    sampleSize: z.number(),
    metrics: z.array(z.object({
      metric: z.string(),
      currentValue: z.number(),
      baselineValue: z.number(),
      changePct: z.number(),
      unit: z.string()
    })).default([]),
    recurringAnomalyCount: z.number().default(0)
  })
});

export type CreateManagerRequest = z.infer<typeof createManagerRequestSchema>;
export type CreateFCRequest = z.infer<typeof createFCRequestSchema>;

