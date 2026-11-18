export const COST_LINES = [
  'MANPOWER',
  'PACKAGING',
  'POWER_AND_FUEL',
  'FC_RENT',
  'EQUIPMENT_RENTALS',
  'OVERHEADS'
] as const;

export type CostLine = typeof COST_LINES[number];

export const COST_LINE_LABELS: Record<CostLine, string> = {
  MANPOWER: 'Manpower Cost',
  PACKAGING: 'Packaging Cost',
  POWER_AND_FUEL: 'Power & Fuel',
  FC_RENT: 'FC Rent',
  EQUIPMENT_RENTALS: 'Equipment Rentals',
  OVERHEADS: 'Overheads'
};

export const FC_COLOURS = ['RED', 'YELLOW', 'GREEN', 'BLUE'] as const;
export type FCColour = typeof FC_COLOURS[number];

export const TARGET_BANDS = {
  CM1: {
    min: '65',
    max: '70',
    toleranceLow: '62',
    toleranceHigh: '73'
  },
  CM2: {
    min: '15',
    max: '30',
    toleranceLow: '12',
    toleranceHigh: '33'
  }
} as const;

export const ANOMALY_TYPES = [
  'COST_BELOW_MIN',
  'COST_ABOVE_MAX',
  'CM1_DEVIATION',
  'CM2_DEVIATION',
  'SUSPICIOUS_HIGH_MARGIN'
] as const;
export type AnomalyType = typeof ANOMALY_TYPES[number];

export const COST_LINE_STATUSES = [
  'IN_RANGE',
  'BELOW_MIN',
  'ABOVE_MAX',
  'TARGET_NOT_CONFIGURED'
] as const;
export type CostLineStatus = typeof COST_LINE_STATUSES[number];

export const SUBMISSION_STATUSES = [
  'MISSING',
  'RECEIVED',
  'VALIDATING',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'INVALID',
  'FAILED'
] as const;
export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];

export const UPLOAD_MODES = ['CENTRALIZED', 'SINGLE_FC'] as const;
export type UploadMode = typeof UPLOAD_MODES[number];

export const UPLOAD_BATCH_STATUSES = [
  'INITIATED',
  'UPLOADED',
  'PROCESSING',
  'COMPLETED',
  'PARTIALLY_FAILED',
  'FAILED'
] as const;
export type UploadBatchStatus = typeof UPLOAD_BATCH_STATUSES[number];

export const USER_ROLES = ['ADMIN', 'FINANCE', 'FC_MANAGER'] as const;
export type UserRole = typeof USER_ROLES[number];

export const REVIEW_STATUSES = [
  'PENDING',
  'ACKNOWLEDGED',
  'DISMISSED',
  'RESOLVED',
  'NEEDS_INVESTIGATION'
] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export const JOB_TYPES = [
  'PROCESS_UPLOAD',
  'ANALYZE_SUBMISSION',
  'GENERATE_AI_REPORT',
  'SEND_FC_DIGEST',
  'SEND_MISSING_SUBMISSION_ALERT',
  'RECONCILE_STALE_WORK'
] as const;
export type JobType = typeof JOB_TYPES[number];

export const JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
] as const;
export type JobStatus = typeof JOB_STATUSES[number];

export const EMAIL_STATUSES = [
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'UNKNOWN'
] as const;
export type EmailStatus = typeof EMAIL_STATUSES[number];

export const RESPONSIBLE_TEAMS = [
  'FC_OPERATIONS',
  'FINANCE',
  'PROCUREMENT',
  'HR',
  'MANAGEMENT'
] as const;
export type ResponsibleTeam = typeof RESPONSIBLE_TEAMS[number];

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Severity = typeof SEVERITIES[number];

export const DATASET_TYPES = [
  'PNL',
  'DAILY_OPERATIONS',
  'DAILY_LABOR',
  'COMBINED_OPERATIONS_LABOR'
] as const;
export type DatasetType = typeof DATASET_TYPES[number];

export const DIAGNOSTIC_STATUSES = [
  'COMPLETE',
  'PARTIAL',
  'INSUFFICIENT_DATA',
  'VALIDATION_FAILED',
  'FAILED'
] as const;
export type DiagnosticStatus = typeof DIAGNOSTIC_STATUSES[number];

export const EVIDENCE_COMPLETENESS_STATES = [
  'COMPLETE',
  'FINANCIAL_ONLY',
  'PENDING_OPERATIONS',
  'PENDING_LABOR',
  'PARTIAL',
  'INSUFFICIENT_DATA'
] as const;
export type EvidenceCompleteness = typeof EVIDENCE_COMPLETENESS_STATES[number];

export const FINDING_CLASSIFICATIONS = [
  'OBSERVED_FACT',
  'SUPPORTED_HYPOTHESIS',
  'UNVERIFIED_POSSIBILITY',
  'DATA_QUALITY_ISSUE'
] as const;
export type FindingClassification = typeof FINDING_CLASSIFICATIONS[number];

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];
