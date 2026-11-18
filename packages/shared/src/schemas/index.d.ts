import { z } from 'zod';
export declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    API_PORT: z.ZodDefault<z.ZodNumber>;
    WEB_URL: z.ZodDefault<z.ZodString>;
    API_URL: z.ZodDefault<z.ZodString>;
    BUSINESS_TIMEZONE: z.ZodDefault<z.ZodString>;
    DATABASE_URL: z.ZodString;
    AWS_REGION: z.ZodDefault<z.ZodString>;
    AWS_S3_BUCKET: z.ZodDefault<z.ZodString>;
    AWS_ACCESS_KEY_ID: z.ZodOptional<z.ZodString>;
    AWS_SECRET_ACCESS_KEY: z.ZodOptional<z.ZodString>;
    AWS_S3_ENDPOINT: z.ZodOptional<z.ZodString>;
    AWS_S3_FORCE_PATH_STYLE: z.ZodDefault<z.ZodEffects<z.ZodString, boolean, string>>;
    S3_PRESIGNED_URL_TTL_SECONDS: z.ZodDefault<z.ZodNumber>;
    MAX_UPLOAD_SIZE_BYTES: z.ZodDefault<z.ZodNumber>;
    JWT_ACCESS_SECRET: z.ZodDefault<z.ZodString>;
    JWT_REFRESH_SECRET: z.ZodDefault<z.ZodString>;
    COOKIE_SECURE: z.ZodDefault<z.ZodEffects<z.ZodString, boolean, string>>;
    LLM_PROVIDER: z.ZodDefault<z.ZodEnum<["openai", "mock"]>>;
    OPENAI_API_KEY: z.ZodOptional<z.ZodString>;
    OPENAI_MODEL: z.ZodDefault<z.ZodString>;
    LLM_TIMEOUT_MS: z.ZodDefault<z.ZodNumber>;
    LLM_MAX_RETRIES: z.ZodDefault<z.ZodNumber>;
    EMAIL_PROVIDER: z.ZodDefault<z.ZodEnum<["resend", "smtp", "test"]>>;
    EMAIL_FROM: z.ZodDefault<z.ZodString>;
    RESEND_API_KEY: z.ZodOptional<z.ZodString>;
    SMTP_HOST: z.ZodOptional<z.ZodString>;
    SMTP_PORT: z.ZodDefault<z.ZodNumber>;
    SMTP_SECURE: z.ZodDefault<z.ZodEffects<z.ZodString, boolean, string>>;
    SMTP_USER: z.ZodOptional<z.ZodString>;
    SMTP_PASS: z.ZodOptional<z.ZodString>;
    WORKER_ID: z.ZodDefault<z.ZodString>;
    WORKER_POLL_INTERVAL_MS: z.ZodDefault<z.ZodNumber>;
    WORKER_CONCURRENCY: z.ZodDefault<z.ZodNumber>;
    JOB_LEASE_SECONDS: z.ZodDefault<z.ZodNumber>;
    JOB_HEARTBEAT_INTERVAL_SECONDS: z.ZodDefault<z.ZodNumber>;
    JOB_MAX_ATTEMPTS: z.ZodDefault<z.ZodNumber>;
    JOB_BASE_BACKOFF_MS: z.ZodDefault<z.ZodNumber>;
    JOB_MAX_BACKOFF_MS: z.ZodDefault<z.ZodNumber>;
    LANGGRAPH_DATABASE_URL: z.ZodOptional<z.ZodString>;
    LANGGRAPH_SCHEMA: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    API_PORT: number;
    WEB_URL: string;
    API_URL: string;
    BUSINESS_TIMEZONE: string;
    DATABASE_URL: string;
    AWS_REGION: string;
    AWS_S3_BUCKET: string;
    AWS_S3_FORCE_PATH_STYLE: boolean;
    S3_PRESIGNED_URL_TTL_SECONDS: number;
    MAX_UPLOAD_SIZE_BYTES: number;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    COOKIE_SECURE: boolean;
    LLM_PROVIDER: "openai" | "mock";
    OPENAI_MODEL: string;
    LLM_TIMEOUT_MS: number;
    LLM_MAX_RETRIES: number;
    EMAIL_PROVIDER: "test" | "resend" | "smtp";
    EMAIL_FROM: string;
    SMTP_PORT: number;
    SMTP_SECURE: boolean;
    WORKER_ID: string;
    WORKER_POLL_INTERVAL_MS: number;
    WORKER_CONCURRENCY: number;
    JOB_LEASE_SECONDS: number;
    JOB_HEARTBEAT_INTERVAL_SECONDS: number;
    JOB_MAX_ATTEMPTS: number;
    JOB_BASE_BACKOFF_MS: number;
    JOB_MAX_BACKOFF_MS: number;
    LANGGRAPH_SCHEMA: string;
    AWS_ACCESS_KEY_ID?: string | undefined;
    AWS_SECRET_ACCESS_KEY?: string | undefined;
    AWS_S3_ENDPOINT?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
    RESEND_API_KEY?: string | undefined;
    SMTP_HOST?: string | undefined;
    SMTP_USER?: string | undefined;
    SMTP_PASS?: string | undefined;
    LANGGRAPH_DATABASE_URL?: string | undefined;
}, {
    DATABASE_URL: string;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    API_PORT?: number | undefined;
    WEB_URL?: string | undefined;
    API_URL?: string | undefined;
    BUSINESS_TIMEZONE?: string | undefined;
    AWS_REGION?: string | undefined;
    AWS_S3_BUCKET?: string | undefined;
    AWS_ACCESS_KEY_ID?: string | undefined;
    AWS_SECRET_ACCESS_KEY?: string | undefined;
    AWS_S3_ENDPOINT?: string | undefined;
    AWS_S3_FORCE_PATH_STYLE?: string | undefined;
    S3_PRESIGNED_URL_TTL_SECONDS?: number | undefined;
    MAX_UPLOAD_SIZE_BYTES?: number | undefined;
    JWT_ACCESS_SECRET?: string | undefined;
    JWT_REFRESH_SECRET?: string | undefined;
    COOKIE_SECURE?: string | undefined;
    LLM_PROVIDER?: "openai" | "mock" | undefined;
    OPENAI_API_KEY?: string | undefined;
    OPENAI_MODEL?: string | undefined;
    LLM_TIMEOUT_MS?: number | undefined;
    LLM_MAX_RETRIES?: number | undefined;
    EMAIL_PROVIDER?: "test" | "resend" | "smtp" | undefined;
    EMAIL_FROM?: string | undefined;
    RESEND_API_KEY?: string | undefined;
    SMTP_HOST?: string | undefined;
    SMTP_PORT?: number | undefined;
    SMTP_SECURE?: string | undefined;
    SMTP_USER?: string | undefined;
    SMTP_PASS?: string | undefined;
    WORKER_ID?: string | undefined;
    WORKER_POLL_INTERVAL_MS?: number | undefined;
    WORKER_CONCURRENCY?: number | undefined;
    JOB_LEASE_SECONDS?: number | undefined;
    JOB_HEARTBEAT_INTERVAL_SECONDS?: number | undefined;
    JOB_MAX_ATTEMPTS?: number | undefined;
    JOB_BASE_BACKOFF_MS?: number | undefined;
    JOB_MAX_BACKOFF_MS?: number | undefined;
    LANGGRAPH_DATABASE_URL?: string | undefined;
    LANGGRAPH_SCHEMA?: string | undefined;
}>;
export type EnvConfig = z.infer<typeof envSchema>;
export declare const dailyFCInputSchema: z.ZodObject<{
    fcId: z.ZodString;
    businessDate: z.ZodString;
    currency: z.ZodDefault<z.ZodString>;
    revenue: z.ZodEffects<z.ZodString, string, string>;
    manpowerCost: z.ZodEffects<z.ZodString, string, string>;
    packagingCost: z.ZodEffects<z.ZodString, string, string>;
    powerFuelCost: z.ZodEffects<z.ZodString, string, string>;
    fcRent: z.ZodEffects<z.ZodString, string, string>;
    equipmentRentals: z.ZodEffects<z.ZodString, string, string>;
    overheads: z.ZodEffects<z.ZodString, string, string>;
    sourceRowIndex: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    fcId: string;
    businessDate: string;
    currency: string;
    revenue: string;
    manpowerCost: string;
    packagingCost: string;
    powerFuelCost: string;
    fcRent: string;
    equipmentRentals: string;
    overheads: string;
    sourceRowIndex: number;
}, {
    fcId: string;
    businessDate: string;
    revenue: string;
    manpowerCost: string;
    packagingCost: string;
    powerFuelCost: string;
    fcRent: string;
    equipmentRentals: string;
    overheads: string;
    sourceRowIndex: number;
    currency?: string | undefined;
}>;
export type DailyFCInput = z.infer<typeof dailyFCInputSchema>;
export declare const loginRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export declare const initiateUploadRequestSchema: z.ZodObject<{
    fileName: z.ZodString;
    contentType: z.ZodString;
    fileSize: z.ZodNumber;
    mode: z.ZodDefault<z.ZodEnum<["CENTRALIZED", "SINGLE_FC"]>>;
    fcId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fileName: string;
    contentType: string;
    fileSize: number;
    mode: "CENTRALIZED" | "SINGLE_FC";
    fcId?: string | undefined;
}, {
    fileName: string;
    contentType: string;
    fileSize: number;
    fcId?: string | undefined;
    mode?: "CENTRALIZED" | "SINGLE_FC" | undefined;
}>;
export type InitiateUploadRequest = z.infer<typeof initiateUploadRequestSchema>;
export declare const findingSchema: z.ZodObject<{
    findingId: z.ZodString;
    anomalyId: z.ZodNullable<z.ZodString>;
    lineItem: z.ZodString;
    explanation: z.ZodString;
    evidenceRefs: z.ZodArray<z.ZodString, "many">;
    confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
}, "strip", z.ZodTypeAny, {
    findingId: string;
    anomalyId: string | null;
    lineItem: string;
    explanation: string;
    evidenceRefs: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW";
}, {
    findingId: string;
    anomalyId: string | null;
    lineItem: string;
    explanation: string;
    evidenceRefs: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW";
}>;
export declare const possibleCauseSchema: z.ZodObject<{
    cause: z.ZodString;
    supportingEvidenceRefs: z.ZodArray<z.ZodString, "many">;
    confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
}, "strip", z.ZodTypeAny, {
    confidence: "HIGH" | "MEDIUM" | "LOW";
    cause: string;
    supportingEvidenceRefs: string[];
}, {
    confidence: "HIGH" | "MEDIUM" | "LOW";
    cause: string;
    supportingEvidenceRefs: string[];
}>;
export declare const investigationOutputSchema: z.ZodObject<{
    summary: z.ZodString;
    findings: z.ZodArray<z.ZodObject<{
        findingId: z.ZodString;
        anomalyId: z.ZodNullable<z.ZodString>;
        lineItem: z.ZodString;
        explanation: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodString, "many">;
        confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
    }, "strip", z.ZodTypeAny, {
        findingId: string;
        anomalyId: string | null;
        lineItem: string;
        explanation: string;
        evidenceRefs: string[];
        confidence: "HIGH" | "MEDIUM" | "LOW";
    }, {
        findingId: string;
        anomalyId: string | null;
        lineItem: string;
        explanation: string;
        evidenceRefs: string[];
        confidence: "HIGH" | "MEDIUM" | "LOW";
    }>, "many">;
    possibleCauses: z.ZodArray<z.ZodObject<{
        cause: z.ZodString;
        supportingEvidenceRefs: z.ZodArray<z.ZodString, "many">;
        confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
    }, "strip", z.ZodTypeAny, {
        confidence: "HIGH" | "MEDIUM" | "LOW";
        cause: string;
        supportingEvidenceRefs: string[];
    }, {
        confidence: "HIGH" | "MEDIUM" | "LOW";
        cause: string;
        supportingEvidenceRefs: string[];
    }>, "many">;
    recurringIssue: z.ZodBoolean;
    unresolvedQuestions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    summary: string;
    findings: {
        findingId: string;
        anomalyId: string | null;
        lineItem: string;
        explanation: string;
        evidenceRefs: string[];
        confidence: "HIGH" | "MEDIUM" | "LOW";
    }[];
    possibleCauses: {
        confidence: "HIGH" | "MEDIUM" | "LOW";
        cause: string;
        supportingEvidenceRefs: string[];
    }[];
    recurringIssue: boolean;
    unresolvedQuestions: string[];
}, {
    summary: string;
    findings: {
        findingId: string;
        anomalyId: string | null;
        lineItem: string;
        explanation: string;
        evidenceRefs: string[];
        confidence: "HIGH" | "MEDIUM" | "LOW";
    }[];
    possibleCauses: {
        confidence: "HIGH" | "MEDIUM" | "LOW";
        cause: string;
        supportingEvidenceRefs: string[];
    }[];
    recurringIssue: boolean;
    unresolvedQuestions: string[];
}>;
export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;
export declare const recommendationItemSchema: z.ZodObject<{
    action: z.ZodString;
    responsibleTeam: z.ZodEnum<["FC_OPERATIONS", "FINANCE", "PROCUREMENT", "HR", "MANAGEMENT"]>;
    priority: z.ZodEnum<["CRITICAL", "HIGH", "MEDIUM", "LOW"]>;
    reason: z.ZodString;
    relatedFindingIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    action: string;
    responsibleTeam: "FINANCE" | "FC_OPERATIONS" | "PROCUREMENT" | "HR" | "MANAGEMENT";
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    relatedFindingIds: string[];
}, {
    action: string;
    responsibleTeam: "FINANCE" | "FC_OPERATIONS" | "PROCUREMENT" | "HR" | "MANAGEMENT";
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    relatedFindingIds: string[];
}>;
export declare const recommendationOutputSchema: z.ZodObject<{
    overallPriority: z.ZodEnum<["CRITICAL", "HIGH", "MEDIUM", "LOW"]>;
    managerSummary: z.ZodString;
    recommendations: z.ZodArray<z.ZodObject<{
        action: z.ZodString;
        responsibleTeam: z.ZodEnum<["FC_OPERATIONS", "FINANCE", "PROCUREMENT", "HR", "MANAGEMENT"]>;
        priority: z.ZodEnum<["CRITICAL", "HIGH", "MEDIUM", "LOW"]>;
        reason: z.ZodString;
        relatedFindingIds: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        action: string;
        responsibleTeam: "FINANCE" | "FC_OPERATIONS" | "PROCUREMENT" | "HR" | "MANAGEMENT";
        priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
        reason: string;
        relatedFindingIds: string[];
    }, {
        action: string;
        responsibleTeam: "FINANCE" | "FC_OPERATIONS" | "PROCUREMENT" | "HR" | "MANAGEMENT";
        priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
        reason: string;
        relatedFindingIds: string[];
    }>, "many">;
    requiresHumanReview: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    overallPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    managerSummary: string;
    recommendations: {
        action: string;
        responsibleTeam: "FINANCE" | "FC_OPERATIONS" | "PROCUREMENT" | "HR" | "MANAGEMENT";
        priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
        reason: string;
        relatedFindingIds: string[];
    }[];
    requiresHumanReview: boolean;
}, {
    overallPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    managerSummary: string;
    recommendations: {
        action: string;
        responsibleTeam: "FINANCE" | "FC_OPERATIONS" | "PROCUREMENT" | "HR" | "MANAGEMENT";
        priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
        reason: string;
        relatedFindingIds: string[];
    }[];
    requiresHumanReview: boolean;
}>;
export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;
export declare const processUploadPayloadSchema: z.ZodObject<{
    batchId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    batchId: string;
}, {
    batchId: string;
}>;
export declare const analyzeSubmissionPayloadSchema: z.ZodObject<{
    submissionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
}, {
    submissionId: string;
}>;
export declare const generateAIReportPayloadSchema: z.ZodObject<{
    submissionId: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    force?: boolean | undefined;
}, {
    submissionId: string;
    force?: boolean | undefined;
}>;
export declare const sendFCDigestPayloadSchema: z.ZodObject<{
    emailOutboxId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    emailOutboxId: string;
}, {
    emailOutboxId: string;
}>;
export declare const sendMissingAlertPayloadSchema: z.ZodObject<{
    submissionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
}, {
    submissionId: string;
}>;
export declare const reconcileStaleWorkPayloadSchema: z.ZodObject<{
    timestamp: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timestamp?: string | undefined;
}, {
    timestamp?: string | undefined;
}>;
export declare const anomalyReviewSchema: z.ZodObject<{
    status: z.ZodEnum<["PENDING", "ACKNOWLEDGED", "DISMISSED", "RESOLVED", "NEEDS_INVESTIGATION"]>;
    reason: z.ZodOptional<z.ZodString>;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "ACKNOWLEDGED" | "DISMISSED" | "RESOLVED" | "NEEDS_INVESTIGATION";
    reason?: string | undefined;
    comment?: string | undefined;
}, {
    status: "PENDING" | "ACKNOWLEDGED" | "DISMISSED" | "RESOLVED" | "NEEDS_INVESTIGATION";
    reason?: string | undefined;
    comment?: string | undefined;
}>;
export declare const actionFeedbackSchema: z.ZodObject<{
    status: z.ZodEnum<["ACCEPTED", "REJECTED", "COMPLETED"]>;
    outcomeNote: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "COMPLETED" | "ACCEPTED" | "REJECTED";
    outcomeNote: string;
}, {
    status: "COMPLETED" | "ACCEPTED" | "REJECTED";
    outcomeNote: string;
}>;
export declare const createTargetRuleSchema: z.ZodObject<{
    fcId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metricKey: z.ZodString;
    minPct: z.ZodEffects<z.ZodString, string, string>;
    maxPct: z.ZodEffects<z.ZodString, string, string>;
    effectiveFrom: z.ZodString;
    effectiveTo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    metricKey: string;
    minPct: string;
    maxPct: string;
    effectiveFrom: string;
    fcId?: string | null | undefined;
    effectiveTo?: string | null | undefined;
}, {
    metricKey: string;
    minPct: string;
    maxPct: string;
    effectiveFrom: string;
    fcId?: string | null | undefined;
    effectiveTo?: string | null | undefined;
}>;
//# sourceMappingURL=index.d.ts.map