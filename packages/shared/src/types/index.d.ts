import { CostLine, FCColour, AnomalyType, CostLineStatus, Severity } from '../constants/index.js';
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
    impactAmount: string | null;
    severity: Severity;
    description: string;
}
export interface NormalizedFCRecord {
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
}
export interface RowValidationError {
    rowIndex: number;
    fcId?: string;
    field?: string;
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
//# sourceMappingURL=index.d.ts.map