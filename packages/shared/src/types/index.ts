import {
  CostLine,
  FCColour,
  AnomalyType,
  CostLineStatus,
  Severity,
  DiagnosticStatus,
  EvidenceCompleteness,
  FindingClassification,
  ConfidenceLevel,
  ResponsibleTeam
} from '../constants/index';

export interface TargetSnapshotItem {
  metricKey: string;
  minPct: string | null;
  maxPct: string | null;
  ruleId?: string;
  isFcSpecific: boolean;
}

export type TargetSnapshot = Record<string, TargetSnapshotItem>;

export interface CalculatedCostLine {
  lineItem: CostLine;
  amount: string;
  percentage: string;
  targetMinPct: string | null;
  targetMaxPct: string | null;
  status: CostLineStatus;
  excessAmount: string | null;
}

export interface CalculatedPnL {
  revenue: string;
  currency: string;
  manpowerCost: string;
  packagingCost: string;
  powerFuelCost: string;
  fcRent: string;
  equipmentRentals: string;
  overheads: string;
  costLines: CalculatedCostLine[];
  cm1: string;
  cm1Pct: string;
  cm2: string;
  cm2Pct: string;
  colour: FCColour;
  targetSnapshot: TargetSnapshot;
  anomalies: DetectedAnomaly[];
}

export interface DetectedAnomaly {
  type: AnomalyType;
  metricKey: string;
  actualPct: string;
  targetMinPct: string | null;
  targetMaxPct: string | null;
  deviationPP: string | null;
  deviationFromTargetPP?: string | null;
  breachBeyondTolerancePP?: string | null;
  impactAmount: string | null;
  severity: Severity;
  description: string;
}

export interface NormalizedFCRecord {
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

export interface DailyOperationsInput {
  fcId: string;
  businessDate: string;
  inboundShipments: number;
  outboundOrders: number;
  unitsProcessed: number;
  orderLinesProcessed: number;
  returnsProcessed: number;
  operatingHours: number;
  storageOccupancyPct: number | null;
  sourceRowIndex?: number;
}

export interface DailyLaborInput {
  fcId: string;
  businessDate: string;
  plannedHeadcount: number;
  actualHeadcount: number;
  plannedLabourHours: number;
  actualPaidHours: number;
  productiveHours: number;
  overtimeHours: number;
  contractorHeadcount: number;
  contractorHours: number;
  contractorCost: string;
  sourceRowIndex?: number;
}

export interface DerivedOperationalMetrics {
  averageOrderLines: number | null;
  unitsPerOrder: number | null;
  ordersPerOperatingHour: number | null;
  returnsRate: number | null;
}

export interface DerivedWorkforceMetrics {
  labourUtilization: number | null;
  overtimeRatio: number | null;
  ordersPerPaidLabourHour: number | null;
  unitsPerProductiveLabourHour: number | null;
  actualVsPlannedLabourHours: number | null;
  contractorHourShare: number | null;
}

export interface DerivedProductivityMetrics {
  manpowerCostPerOrder: number | null;
  manpowerCostPerPaidHour: number | null;
  contractorCostShareOfManpower: number | null;
}

export interface MetricHistoricalComparison {
  metric: string;
  currentValue: number | null;
  baselineValue: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  unit: string;
  sampleSize: number;
  dataSource: string;
  dataPeriod?: string;
}

export interface InvestigationFindingEvidence {
  metric: string;
  currentValue: number | null;
  baselineValue: number | null;
  difference: number | null;
  unit: string;
  source: string;
  businessDate: string;
}

export interface InvestigationFinding {
  findingId: string;
  anomalyId: string | null;
  title: string;
  explanation: string;
  classification: FindingClassification;
  evidence?: InvestigationFindingEvidence[];
  confidence: ConfidenceLevel;
  lineItem?: string;
  evidenceRefs: string[];
}

export type InvestigationOutputFinding = InvestigationFinding & {
  lineItem: string;
  evidenceRefs: string[];
};

export interface WorkflowTokenUsage {
  investigationInputTokens: number;
  investigationOutputTokens: number;
  recommendationInputTokens: number;
  recommendationOutputTokens: number;
  totalLLMTokenUsage: number;
}

export interface EvidenceItem {
  id: string;
  metric: string;
  value: number | string | null;
  unit: string;
  source: string;
  description?: string;
}

export interface InvestigationContext {
  fcId: string;
  businessDate: string;
  dataAvailability: {
    pnl: boolean;
    operations: boolean;
    labor: boolean;
    historical: boolean;
  };
  financial: {
    revenue: string;
    cm1: string;
    cm1Pct: string;
    cm2: string;
    cm2Pct: string;
    colour: string;
    costs: Array<{
      lineItem: string;
      amount: string;
      actualPct: string;
      targetMinPct: string;
      targetMaxPct: string;
      status: string;
      excessAmount: string | null;
    }>;
  };
  anomalies: Array<{
    id: string;
    metricKey: string;
    type: string;
    severity: string;
    deviationFromTargetPP: string | null;
    breachBeyondTolerancePP: string | null;
  }>;
  operations: {
    inboundShipments: number;
    outboundOrders: number;
    unitsProcessed: number;
    orderLinesProcessed: number;
    returnsProcessed: number;
    operatingHours: number;
    storageOccupancyPct: number | null;
  } | null;
  labor: {
    plannedHeadcount: number;
    actualHeadcount: number;
    plannedHours: number;
    paidHours: number;
    productiveHours: number;
    overtimeHours: number;
    contractorHeadcount: number;
    contractorHours: number;
    contractorCost: string;
  } | null;
  metrics: {
    averageOrderLines?: number;
    unitsPerOrder?: number;
    ordersPerOperatingHour?: number;
    returnsRatePct?: number;
    labourUtilizationPct?: number;
    overtimeRatioPct?: number;
    ordersPerPaidHour?: number;
    unitsPerProductiveHour?: number;
    actualVsPlannedHoursPct?: number;
    contractorHourSharePct?: number;
    manpowerCostPerOrder?: number;
    manpowerCostPerPaidHour?: number;
    contractorCostSharePct?: number;
  };
  reconciliation: {
    status: string;
    warnings: string[];
    contractorCostSharePct?: number | null;
    contractorHourSharePct?: number | null;
    contractorCostPerHour?: number | null;
    nonContractorCostPerHour?: number | null;
    signal?: string;
    assumptions?: string[];
  };
  history: {
    available: boolean;
    sampleSize: number;
    metrics: Array<{
      metric: string;
      currentValue: number;
      baselineValue: number;
      changePct: number;
      unit: string;
    }>;
    recurringAnomalyCount: number;
  };
  evidenceRegistry?: EvidenceItem[];
}

export interface InvestigationResult {
  summary: string;
  diagnosticStatus: DiagnosticStatus;
  findings: InvestigationFinding[];
  dataGaps: string[];
  unresolvedQuestions: string[];
  recurringIssue: boolean;
}

export interface Recommendation {
  action: string;
  responsibleTeam: ResponsibleTeam;
  priority: Severity;
  supportingFindingIds: string[];
  rationale: string;
  expectedOutcome: string;
  successMetric: string;
  reviewAfterDays: number;
  expectedSavingINR: string | null;
  requiresHumanApproval: boolean;
}

export interface RecommendationResult {
  overallPriority: Severity;
  managerSummary: string;
  recommendations: Recommendation[];
  requiresHumanReview: boolean;
}

export interface DataCompletenessEvaluation {
  fcId: string;
  businessDate: string;
  hasPnl: boolean;
  hasOperations: boolean;
  hasLabor: boolean;
  completeness: EvidenceCompleteness;
  diagnosticStatus: DiagnosticStatus;
  pnlVersion?: number;
  operationsVersion?: number;
  laborVersion?: number;
}

export interface RowValidationError {
  rowIndex: number;
  fcId?: string;
  field?: string;
  code?: string;
  message: string;
  rawValue?: any;
}

export interface ParseResult {
  records: NormalizedFCRecord[];
  errors: RowValidationError[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface OperationsParseResult {
  records: DailyOperationsInput[];
  errors: RowValidationError[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface LaborParseResult {
  records: DailyLaborInput[];
  errors: RowValidationError[];
  warnings: RowValidationError[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  severity: Severity;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: any;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

