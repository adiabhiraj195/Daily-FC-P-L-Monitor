"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEVERITIES = exports.RESPONSIBLE_TEAMS = exports.EMAIL_STATUSES = exports.JOB_STATUSES = exports.JOB_TYPES = exports.REVIEW_STATUSES = exports.USER_ROLES = exports.UPLOAD_BATCH_STATUSES = exports.UPLOAD_MODES = exports.SUBMISSION_STATUSES = exports.COST_LINE_STATUSES = exports.ANOMALY_TYPES = exports.TARGET_BANDS = exports.FC_COLOURS = exports.COST_LINE_LABELS = exports.COST_LINES = void 0;
exports.COST_LINES = [
    'MANPOWER',
    'PACKAGING',
    'POWER_AND_FUEL',
    'FC_RENT',
    'EQUIPMENT_RENTALS',
    'OVERHEADS'
];
exports.COST_LINE_LABELS = {
    MANPOWER: 'Manpower Cost',
    PACKAGING: 'Packaging Cost',
    POWER_AND_FUEL: 'Power & Fuel',
    FC_RENT: 'FC Rent',
    EQUIPMENT_RENTALS: 'Equipment Rentals',
    OVERHEADS: 'Overheads'
};
exports.FC_COLOURS = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
exports.TARGET_BANDS = {
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
};
exports.ANOMALY_TYPES = [
    'COST_BELOW_MIN',
    'COST_ABOVE_MAX',
    'CM1_DEVIATION',
    'CM2_DEVIATION',
    'SUSPICIOUS_HIGH_MARGIN'
];
exports.COST_LINE_STATUSES = [
    'IN_RANGE',
    'BELOW_MIN',
    'ABOVE_MAX',
    'TARGET_NOT_CONFIGURED'
];
exports.SUBMISSION_STATUSES = [
    'MISSING',
    'RECEIVED',
    'VALIDATING',
    'QUEUED',
    'PROCESSING',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'INVALID',
    'FAILED'
];
exports.UPLOAD_MODES = ['CENTRALIZED', 'SINGLE_FC'];
exports.UPLOAD_BATCH_STATUSES = [
    'INITIATED',
    'UPLOADED',
    'PROCESSING',
    'COMPLETED',
    'PARTIALLY_FAILED',
    'FAILED'
];
exports.USER_ROLES = ['ADMIN', 'FINANCE', 'FC_MANAGER'];
exports.REVIEW_STATUSES = [
    'PENDING',
    'ACKNOWLEDGED',
    'DISMISSED',
    'RESOLVED',
    'NEEDS_INVESTIGATION'
];
exports.JOB_TYPES = [
    'PROCESS_UPLOAD',
    'ANALYZE_SUBMISSION',
    'GENERATE_AI_REPORT',
    'SEND_FC_DIGEST',
    'SEND_MISSING_SUBMISSION_ALERT',
    'RECONCILE_STALE_WORK'
];
exports.JOB_STATUSES = [
    'PENDING',
    'RUNNING',
    'RETRY_WAIT',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
];
exports.EMAIL_STATUSES = [
    'PENDING',
    'SENDING',
    'SENT',
    'FAILED',
    'UNKNOWN'
];
exports.RESPONSIBLE_TEAMS = [
    'FC_OPERATIONS',
    'FINANCE',
    'PROCUREMENT',
    'HR',
    'MANAGEMENT'
];
exports.SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
//# sourceMappingURL=index.js.map