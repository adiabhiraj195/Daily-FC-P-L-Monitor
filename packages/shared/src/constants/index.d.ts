export declare const COST_LINES: readonly ["MANPOWER", "PACKAGING", "POWER_AND_FUEL", "FC_RENT", "EQUIPMENT_RENTALS", "OVERHEADS"];
export type CostLine = typeof COST_LINES[number];
export declare const COST_LINE_LABELS: Record<CostLine, string>;
export declare const FC_COLOURS: readonly ["RED", "YELLOW", "GREEN", "BLUE"];
export type FCColour = typeof FC_COLOURS[number];
export declare const TARGET_BANDS: {
    readonly CM1: {
        readonly min: "65";
        readonly max: "70";
        readonly toleranceLow: "62";
        readonly toleranceHigh: "73";
    };
    readonly CM2: {
        readonly min: "15";
        readonly max: "30";
        readonly toleranceLow: "12";
        readonly toleranceHigh: "33";
    };
};
export declare const ANOMALY_TYPES: readonly ["COST_BELOW_MIN", "COST_ABOVE_MAX", "CM1_DEVIATION", "CM2_DEVIATION", "SUSPICIOUS_HIGH_MARGIN"];
export type AnomalyType = typeof ANOMALY_TYPES[number];
export declare const COST_LINE_STATUSES: readonly ["IN_RANGE", "BELOW_MIN", "ABOVE_MAX", "TARGET_NOT_CONFIGURED"];
export type CostLineStatus = typeof COST_LINE_STATUSES[number];
export declare const SUBMISSION_STATUSES: readonly ["MISSING", "RECEIVED", "VALIDATING", "QUEUED", "PROCESSING", "COMPLETED", "PARTIALLY_COMPLETED", "INVALID", "FAILED"];
export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];
export declare const UPLOAD_MODES: readonly ["CENTRALIZED", "SINGLE_FC"];
export type UploadMode = typeof UPLOAD_MODES[number];
export declare const UPLOAD_BATCH_STATUSES: readonly ["INITIATED", "UPLOADED", "PROCESSING", "COMPLETED", "PARTIALLY_FAILED", "FAILED"];
export type UploadBatchStatus = typeof UPLOAD_BATCH_STATUSES[number];
export declare const USER_ROLES: readonly ["ADMIN", "FINANCE", "FC_MANAGER"];
export type UserRole = typeof USER_ROLES[number];
export declare const REVIEW_STATUSES: readonly ["PENDING", "ACKNOWLEDGED", "DISMISSED", "RESOLVED", "NEEDS_INVESTIGATION"];
export type ReviewStatus = typeof REVIEW_STATUSES[number];
export declare const JOB_TYPES: readonly ["PROCESS_UPLOAD", "ANALYZE_SUBMISSION", "GENERATE_AI_REPORT", "SEND_FC_DIGEST", "SEND_MISSING_SUBMISSION_ALERT", "RECONCILE_STALE_WORK"];
export type JobType = typeof JOB_TYPES[number];
export declare const JOB_STATUSES: readonly ["PENDING", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "FAILED", "CANCELLED"];
export type JobStatus = typeof JOB_STATUSES[number];
export declare const EMAIL_STATUSES: readonly ["PENDING", "SENDING", "SENT", "FAILED", "UNKNOWN"];
export type EmailStatus = typeof EMAIL_STATUSES[number];
export declare const RESPONSIBLE_TEAMS: readonly ["FC_OPERATIONS", "FINANCE", "PROCUREMENT", "HR", "MANAGEMENT"];
export type ResponsibleTeam = typeof RESPONSIBLE_TEAMS[number];
export declare const SEVERITIES: readonly ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export type Severity = typeof SEVERITIES[number];
//# sourceMappingURL=index.d.ts.map