import ExcelJS from 'exceljs';
export { ExcelJS };
import { parse as parseCsvSync } from 'csv-parse/sync';
import {
  DailyOperationsInput,
  DailyLaborInput,
  OperationsParseResult,
  LaborParseResult,
  RowValidationError,
  dailyOperationsInputSchema,
  dailyLaborInputSchema
} from '@prozo/shared';
import { normalizeDate } from './parser.js';

export type OperationsHeaderKey =
  | 'fcId'
  | 'businessDate'
  | 'inboundShipments'
  | 'outboundOrders'
  | 'unitsProcessed'
  | 'orderLinesProcessed'
  | 'returnsProcessed'
  | 'operatingHours'
  | 'storageOccupancyPct';

export type LaborHeaderKey =
  | 'fcId'
  | 'businessDate'
  | 'plannedHeadcount'
  | 'actualHeadcount'
  | 'plannedLabourHours'
  | 'actualPaidHours'
  | 'productiveHours'
  | 'overtimeHours'
  | 'contractorHeadcount'
  | 'contractorHours'
  | 'contractorCost';

export type OperationsHeaderMapping = Record<OperationsHeaderKey, string[]>;
export type LaborHeaderMapping = Record<LaborHeaderKey, string[]>;

export const DEFAULT_OPERATIONS_HEADER_MAPPINGS: OperationsHeaderMapping = {
  fcId: ['fcid', 'fc_id', 'fc id', 'fulfilment centre', 'fulfilment center', 'fc code', 'fc', 'centre', 'center', 'warehouse'],
  businessDate: ['businessdate', 'business_date', 'business date', 'date', 'day', 'txn_date', 'transaction date'],
  inboundShipments: ['inboundshipments', 'inbound_shipments', 'inbound shipments', 'inbound shipment', 'inbounds', 'inbound', 'shipments received', 'received shipments'],
  outboundOrders: ['outboundorders', 'outbound_orders', 'outbound orders', 'outbound order', 'outbounds', 'outbound', 'orders dispatched', 'orders', 'dispatched orders'],
  unitsProcessed: ['unitsprocessed', 'units_processed', 'units processed', 'units handled', 'total units', 'units', 'processed units'],
  orderLinesProcessed: ['orderlinesprocessed', 'order_lines_processed', 'order lines processed', 'order lines', 'orderlines', 'orderlines processed', 'lines processed', 'lines handled'],
  returnsProcessed: ['returnsprocessed', 'returns_processed', 'returns processed', 'returns handled', 'returns', 'total returns'],
  operatingHours: ['operatinghours', 'operating_hours', 'operating hours', 'fc operating hours', 'facility operating hours', 'hours operated', 'operation hours'],
  storageOccupancyPct: ['storageoccupancypct', 'storage_occupancy_pct', 'storage occupancy pct', 'storage occupancy %', 'storage occupancy', 'occupancy pct', 'occupancy %', 'occupancy', 'storage occupancy percentage', 'storage_occupancy_percentage']
};

export const DEFAULT_LABOR_HEADER_MAPPINGS: LaborHeaderMapping = {
  fcId: ['fcid', 'fc_id', 'fc id', 'fulfilment centre', 'fulfilment center', 'fc code', 'fc', 'centre', 'center', 'warehouse'],
  businessDate: ['businessdate', 'business_date', 'business date', 'date', 'day', 'txn_date', 'transaction date'],
  plannedHeadcount: [
    'plannedheadcount', 'planned_headcount', 'planned headcount',
    'scheduledheadcount', 'scheduled_headcount', 'scheduled headcount',
    'budgetedheadcount', 'budgeted_headcount', 'budgeted headcount',
    'plannedemployees', 'planned_employees', 'planned employees',
    'plannedstaff', 'planned_staff', 'planned staff',
    'scheduledemployees', 'scheduled_employees', 'scheduled employees',
    'scheduledstaff', 'scheduled_staff', 'scheduled staff',
    'targetheadcount', 'target_headcount', 'target headcount'
  ],
  actualHeadcount: [
    'actualheadcount', 'actual_headcount', 'actual headcount',
    'attendedemployees', 'attended_employees', 'attended employees',
    'actualemployees', 'actual_employees', 'actual employees',
    'presentheadcount', 'present_headcount', 'present headcount',
    'presentstaff', 'present_staff', 'present staff',
    'actualstaff', 'actual_staff', 'actual staff',
    'ondutyheadcount', 'on_duty_headcount', 'on duty headcount'
  ],
  plannedLabourHours: [
    'plannedlabourhours', 'plannedlaborhours', 'planned_labour_hours', 'planned_labor_hours',
    'planned labour hours', 'planned labor hours',
    'scheduledlabourhours', 'scheduledlaborhours', 'scheduled_labour_hours', 'scheduled_labor_hours',
    'scheduled labour hours', 'scheduled labor hours',
    'plannedhours', 'planned_hours', 'planned hours',
    'scheduledhours', 'scheduled_hours', 'scheduled hours',
    'budgetedlabourhours', 'budgetedlaborhours', 'budgeted labour hours', 'budgeted labor hours',
    'budgetedhours', 'budgeted_hours', 'budgeted hours'
  ],
  actualPaidHours: [
    'actualpaidhours', 'actual_paid_hours', 'actual paid hours',
    'paidhours', 'paid_hours', 'paid hours',
    'totalpaidhours', 'total_paid_hours', 'total paid hours',
    'actualhours', 'actual_hours', 'actual hours',
    'totalhours', 'total_hours', 'total hours',
    'actualworkedhours', 'actual_worked_hours', 'actual worked hours'
  ],
  productiveHours: [
    'productivehours', 'productive_hours', 'productive hours',
    'productivelabourhours', 'productivelaborhours', 'productive_labour_hours', 'productive_labor_hours',
    'productive labour hours', 'productive labor hours',
    'directhours', 'direct_hours', 'direct hours',
    'directlabourhours', 'directlaborhours', 'direct labour hours', 'direct labor hours',
    'effectivehours', 'effective_hours', 'effective hours',
    'operationhoursspent', 'operation_hours_spent', 'operation hours spent',
    'operationshours', 'operationhours', 'operations hours', 'operation hours'
  ],
  overtimeHours: [
    'overtimehours', 'overtime_hours', 'overtime hours',
    'othours', 'ot_hours', 'ot hours',
    'overtime', 'ot'
  ],
  contractorHeadcount: [
    'contractorheadcount', 'contractor_headcount', 'contractor headcount',
    'contractorcount', 'contractor_count', 'contractor count',
    'contractheadcount', 'contract_headcount', 'contract headcount',
    'contractworkers', 'contract_workers', 'contract workers',
    'contractorstaff', 'contractor_staff', 'contractor staff',
    'contractstaff', 'contract_staff', 'contract staff',
    'tempheadcount', 'temp_headcount', 'temp headcount',
    'agencyheadcount', 'agency_headcount', 'agency headcount',
    'tempstaff', 'temp_staff', 'temp staff',
    'contractors', 'contractor'
  ],
  contractorHours: [
    'contractorhours', 'contractor_hours', 'contractor hours',
    'contracthours', 'contract_hours', 'contract hours',
    'contractworkerhours', 'contract_worker_hours', 'contract worker hours',
    'contractorworkerhours', 'contractor_worker_hours', 'contractor worker hours',
    'agencyhours', 'agency_hours', 'agency hours',
    'temphours', 'temp_hours', 'temp hours'
  ],
  contractorCost: [
    'contractorcost', 'contractor_cost', 'contractor cost',
    'contractcost', 'contract_cost', 'contract cost',
    'contractorexpenditure', 'contractor_expenditure', 'contractor expenditure',
    'contractorexpense', 'contractor_expense', 'contractor expense',
    'contractorexpenses', 'contractor_expenses', 'contractor expenses',
    'contractworkercost', 'contract_worker_cost', 'contract worker cost',
    'agencycost', 'agency_cost', 'agency cost',
    'tempcost', 'temp_cost', 'temp cost'
  ]
};

function cleanHeader(header: string): string {
  return header
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapGenericHeaders<K extends string>(
  rawHeaders: string[],
  mapping: Record<K, string[]>,
  mandatoryKeys: K[]
): Record<K, number> {
  const result: Partial<Record<K, number>> = {};
  const cleanedRaw = rawHeaders.map((h, idx) => {
    const clean = cleanHeader(String(h ?? ''));
    return {
      clean,
      compact: clean.replace(/\s+/g, ''),
      idx
    };
  });

  for (const [canonicalKey, aliases] of Object.entries(mapping) as [K, string[]][]) {
    const candidates = [String(canonicalKey), ...(aliases || [])];
    let foundIdx: number | undefined;

    // 1. Exact match on normalized clean string
    for (const candidate of candidates) {
      const cleanedCandidate = cleanHeader(candidate);
      const match = cleanedRaw.find(r => r.clean === cleanedCandidate);
      if (match) {
        foundIdx = match.idx;
        break;
      }
    }

    // 2. Compact match (whitespace-stripped) fallback
    if (foundIdx === undefined) {
      for (const candidate of candidates) {
        const cleanedCandidate = cleanHeader(candidate);
        const compactCandidate = cleanedCandidate.replace(/\s+/g, '');
        if (!compactCandidate) continue;
        const match = cleanedRaw.find(r => r.compact === compactCandidate);
        if (match) {
          foundIdx = match.idx;
          break;
        }
      }
    }

    if (foundIdx !== undefined) {
      result[canonicalKey] = foundIdx;
    }
  }

  for (const key of mandatoryKeys) {
    if (result[key] === undefined) {
      const aliasList = mapping[key]?.join(', ') || String(key);
      throw new Error(`Missing mandatory header column: ${String(key)} (Checked aliases: ${aliasList})`);
    }
  }

  return result as Record<K, number>;
}

export function findOperationsHeaderRow(rawRows: any[][]): {
  headerIndex: number;
  headerMap: Record<OperationsHeaderKey, number>;
} {
  const mandatory: OperationsHeaderKey[] = [
    'fcId',
    'businessDate',
    'inboundShipments',
    'outboundOrders',
    'unitsProcessed',
    'orderLinesProcessed',
    'returnsProcessed',
    'operatingHours'
  ];

  let firstError: Error | null = null;
  for (let idx = 0; idx < Math.min(rawRows.length, 25); idx++) {
    const row = rawRows[idx];
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }
    const candidateHeaders = row.map(c => (c !== null && c !== undefined ? String(c) : ''));
    try {
      const headerMap = mapGenericHeaders<OperationsHeaderKey>(candidateHeaders, DEFAULT_OPERATIONS_HEADER_MAPPINGS, mandatory);
      return { headerIndex: idx, headerMap };
    } catch (err: any) {
      if (!firstError) firstError = err;
    }
  }

  throw firstError || new Error('Could not find a valid Daily_Operations header row in the spreadsheet');
}

export function findLaborHeaderRow(rawRows: any[][]): {
  headerIndex: number;
  headerMap: Record<LaborHeaderKey, number>;
} {
  const mandatory: LaborHeaderKey[] = [
    'fcId',
    'businessDate',
    'plannedHeadcount',
    'actualHeadcount',
    'plannedLabourHours',
    'actualPaidHours',
    'productiveHours',
    'overtimeHours',
    'contractorHeadcount',
    'contractorHours',
    'contractorCost'
  ];

  let firstError: Error | null = null;
  for (let idx = 0; idx < Math.min(rawRows.length, 25); idx++) {
    const row = rawRows[idx];
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }
    const candidateHeaders = row.map(c => (c !== null && c !== undefined ? String(c) : ''));
    try {
      const headerMap = mapGenericHeaders<LaborHeaderKey>(candidateHeaders, DEFAULT_LABOR_HEADER_MAPPINGS, mandatory);
      return { headerIndex: idx, headerMap };
    } catch (err: any) {
      if (!firstError) firstError = err;
    }
  }

  throw firstError || new Error('Could not find a valid Daily_Labor header row in the spreadsheet');
}

export class FieldParseError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'FieldParseError';
  }
}

function parseNumberStrict(val: any, fieldName: string, allowNullable = false): number | null {
  if (val === null || val === undefined || String(val).trim() === '') {
    if (allowNullable) return null;
    throw new FieldParseError(fieldName, `${fieldName} cannot be missing or blank`);
  }

  if (typeof val === 'object' && val !== null && 'result' in val) {
    return parseNumberStrict(val.result, fieldName, allowNullable);
  }

  const str = String(val).replace(/[$₹, %]/g, '').trim();
  if (str === '') {
    if (allowNullable) return null;
    throw new FieldParseError(fieldName, `${fieldName} cannot be missing or blank`);
  }

  const num = Number(str);
  if (isNaN(num) || !isFinite(num)) {
    throw new FieldParseError(fieldName, `Invalid numeric value for ${fieldName}: '${val}'`);
  }
  return num;
}

export function parseDailyOperationsRows(rawRows: any[][]): OperationsParseResult {
  const { headerIndex, headerMap } = findOperationsHeaderRow(rawRows);
  const records: DailyOperationsInput[] = [];
  const errors: RowValidationError[] = [];
  const seenKeys = new Set<string>();

  const dataRows = rawRows.slice(headerIndex + 1);

  dataRows.forEach((row, i) => {
    const sourceRowIndex = headerIndex + 2 + i; // 1-based spreadsheet row
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
      return; // Ignore trailing empty rows
    }

    let currentFcId: string | undefined;
    try {
      const rawFcId = row[headerMap.fcId];
      if (!rawFcId || String(rawFcId).trim() === '') {
        errors.push({
          rowIndex: sourceRowIndex,
          field: 'fcId',
          message: 'FC ID cannot be blank',
          rawValue: rawFcId
        });
        return;
      }
      const fcId = String(rawFcId).trim();
      currentFcId = fcId;

      const rawDate = row[headerMap.businessDate];
      let businessDate: string;
      try {
        businessDate = normalizeDate(rawDate);
      } catch (dateErr: any) {
        errors.push({
          rowIndex: sourceRowIndex,
          fcId,
          field: 'businessDate',
          message: dateErr.message,
          rawValue: rawDate
        });
        return;
      }

      // Check duplicates within batch
      const dedupeKey = `${fcId.toUpperCase()}::${businessDate}`;
      if (seenKeys.has(dedupeKey)) {
        errors.push({
          rowIndex: sourceRowIndex,
          fcId,
          field: 'businessDate',
          message: `Duplicate entry for FC '${fcId}' on date '${businessDate}' in the same file`,
          rawValue: businessDate
        });
        return;
      }
      seenKeys.add(dedupeKey);

      const inboundShipments = parseNumberStrict(row[headerMap.inboundShipments], 'inboundShipments');
      const outboundOrders = parseNumberStrict(row[headerMap.outboundOrders], 'outboundOrders');
      const unitsProcessed = parseNumberStrict(row[headerMap.unitsProcessed], 'unitsProcessed');
      const orderLinesProcessed = parseNumberStrict(row[headerMap.orderLinesProcessed], 'orderLinesProcessed');
      const returnsProcessed = parseNumberStrict(row[headerMap.returnsProcessed], 'returnsProcessed');
      const operatingHours = parseNumberStrict(row[headerMap.operatingHours], 'operatingHours');
      const storageOccupancyPct =
        headerMap.storageOccupancyPct !== undefined
          ? parseNumberStrict(row[headerMap.storageOccupancyPct], 'storageOccupancyPct', true)
          : null;

      const rawInput = {
        fcId,
        businessDate,
        inboundShipments: inboundShipments!,
        outboundOrders: outboundOrders!,
        unitsProcessed: unitsProcessed!,
        orderLinesProcessed: orderLinesProcessed!,
        returnsProcessed: returnsProcessed!,
        operatingHours: operatingHours!,
        storageOccupancyPct,
        sourceRowIndex
      };

      const validated = dailyOperationsInputSchema.safeParse(rawInput);
      if (!validated.success) {
        for (const issue of validated.error.issues) {
          errors.push({
            rowIndex: sourceRowIndex,
            fcId,
            field: issue.path.join('.'),
            message: issue.message,
            rawValue: row[headerMap[issue.path[0] as keyof OperationsHeaderMapping]]
          });
        }
        return;
      }

      records.push(validated.data);
    } catch (rowErr: any) {
      errors.push({
        rowIndex: sourceRowIndex,
        fcId: currentFcId,
        field: rowErr.field,
        message: rowErr.message || 'Error parsing row'
      });
    }
  });

  return {
    records,
    errors,
    totalRows: dataRows.length,
    validRows: records.length,
    invalidRows: errors.length
  };
}

export function parseDailyLaborRows(rawRows: any[][]): LaborParseResult {
  const { headerIndex, headerMap } = findLaborHeaderRow(rawRows);
  const records: DailyLaborInput[] = [];
  const errors: RowValidationError[] = [];
  const warnings: RowValidationError[] = [];
  const seenKeys = new Set<string>();

  const dataRows = rawRows.slice(headerIndex + 1);

  dataRows.forEach((row, i) => {
    const sourceRowIndex = headerIndex + 2 + i;
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
      return;
    }

    let currentFcId: string | undefined;
    try {
      const rawFcId = row[headerMap.fcId];
      if (!rawFcId || String(rawFcId).trim() === '') {
        errors.push({
          rowIndex: sourceRowIndex,
          field: 'fcId',
          message: 'FC ID cannot be blank',
          rawValue: rawFcId
        });
        return;
      }
      const fcId = String(rawFcId).trim();
      currentFcId = fcId;

      const rawDate = row[headerMap.businessDate];
      let businessDate: string;
      try {
        businessDate = normalizeDate(rawDate);
      } catch (dateErr: any) {
        errors.push({
          rowIndex: sourceRowIndex,
          fcId,
          field: 'businessDate',
          message: dateErr.message,
          rawValue: rawDate
        });
        return;
      }

      const dedupeKey = `${fcId.toUpperCase()}::${businessDate}`;
      if (seenKeys.has(dedupeKey)) {
        errors.push({
          rowIndex: sourceRowIndex,
          fcId,
          field: 'businessDate',
          message: `Duplicate entry for FC '${fcId}' on date '${businessDate}' in the same file`,
          rawValue: businessDate
        });
        return;
      }
      seenKeys.add(dedupeKey);

      const plannedHeadcount = parseNumberStrict(row[headerMap.plannedHeadcount], 'plannedHeadcount');
      const actualHeadcount = parseNumberStrict(row[headerMap.actualHeadcount], 'actualHeadcount');
      const plannedLabourHours = parseNumberStrict(row[headerMap.plannedLabourHours], 'plannedLabourHours');
      const actualPaidHours = parseNumberStrict(row[headerMap.actualPaidHours], 'actualPaidHours');
      const productiveHours = parseNumberStrict(row[headerMap.productiveHours], 'productiveHours');
      const overtimeHours = parseNumberStrict(row[headerMap.overtimeHours], 'overtimeHours');
      const contractorHeadcount = parseNumberStrict(row[headerMap.contractorHeadcount], 'contractorHeadcount');
      const contractorHours = parseNumberStrict(row[headerMap.contractorHours], 'contractorHours');

      const rawContractorCost = row[headerMap.contractorCost];
      let valContractorCost = rawContractorCost;
      if (typeof valContractorCost === 'object' && valContractorCost !== null && 'result' in valContractorCost) {
        valContractorCost = valContractorCost.result;
      }
      if (valContractorCost === null || valContractorCost === undefined || String(valContractorCost).trim() === '') {
        if (contractorHeadcount === 0 && contractorHours === 0) {
          valContractorCost = '0';
        } else {
          throw new FieldParseError('contractorCost', 'contractorCost cannot be missing or blank');
        }
      }
      const cleanedContractorCost = String(valContractorCost).replace(/[$₹, ]/g, '').trim();
      const numContractorCost = Number(cleanedContractorCost);
      if (isNaN(numContractorCost) || !isFinite(numContractorCost)) {
        throw new FieldParseError('contractorCost', `Invalid numeric value for contractorCost: '${valContractorCost}'`);
      }

      const rawInput = {
        fcId,
        businessDate,
        plannedHeadcount: plannedHeadcount!,
        actualHeadcount: actualHeadcount!,
        plannedLabourHours: plannedLabourHours!,
        actualPaidHours: actualPaidHours!,
        productiveHours: productiveHours!,
        overtimeHours: overtimeHours!,
        contractorHeadcount: contractorHeadcount!,
        contractorHours: contractorHours!,
        contractorCost: cleanedContractorCost,
        sourceRowIndex
      };

      const validated = dailyLaborInputSchema.safeParse(rawInput);
      if (!validated.success) {
        for (const issue of validated.error.issues) {
          errors.push({
            rowIndex: sourceRowIndex,
            fcId,
            field: issue.path.join('.'),
            message: issue.message,
            rawValue: row[headerMap[issue.path[0] as keyof LaborHeaderMapping]]
          });
        }
        return;
      }

      // Operational warnings (non-fatal, advisory flags)
      const data = validated.data;
      if (data.actualPaidHours > 0) {
        const overtimeRatio = (data.overtimeHours / data.actualPaidHours) * 100;
        if (overtimeRatio > 30) {
          warnings.push({
            rowIndex: sourceRowIndex,
            fcId,
            field: 'overtimeHours',
            code: 'HIGH_OVERTIME_RATIO',
            message: `Unusually high overtime ratio: ${overtimeRatio.toFixed(1)}% of paid hours`,
            rawValue: data.overtimeHours
          });
        }

        const utilization = (data.productiveHours / data.actualPaidHours) * 100;
        if (utilization < 60) {
          warnings.push({
            rowIndex: sourceRowIndex,
            fcId,
            field: 'productiveHours',
            code: 'LOW_LABOR_UTILIZATION',
            message: `Low labour utilization: ${utilization.toFixed(1)}% productive hours`,
            rawValue: data.productiveHours
          });
        }
      }

      if (data.plannedHeadcount > 0) {
        const headcountDiffPct = Math.abs((data.actualHeadcount - data.plannedHeadcount) / data.plannedHeadcount) * 100;
        if (headcountDiffPct > 35) {
          warnings.push({
            rowIndex: sourceRowIndex,
            fcId,
            field: 'actualHeadcount',
            code: 'SUDDEN_WORKFORCE_CHANGE',
            message: `Sudden workforce change: actual headcount differs by ${headcountDiffPct.toFixed(1)}% from planned`,
            rawValue: data.actualHeadcount
          });
        }
      }

      records.push(data);
    } catch (rowErr: any) {
      errors.push({
        rowIndex: sourceRowIndex,
        fcId: currentFcId,
        field: rowErr.field,
        message: rowErr.message || 'Error parsing row'
      });
    }
  });

  return {
    records,
    errors,
    warnings,
    totalRows: dataRows.length,
    validRows: records.length,
    invalidRows: errors.length
  };
}

export async function parseOperationalWorkbookBuffer(
  buffer: Buffer,
  isCsv: boolean,
  targetDatasetType?: 'DAILY_OPERATIONS' | 'DAILY_LABOR' | 'COMBINED_OPERATIONS_LABOR' | 'PNL'
): Promise<{
  operations?: OperationsParseResult;
  labor?: LaborParseResult;
}> {
  if (isCsv) {
    const rawRows = parseCsvSync(buffer, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    }) as any[][];

    if (targetDatasetType === 'DAILY_LABOR') {
      return { labor: parseDailyLaborRows(rawRows) };
    }
    if (targetDatasetType === 'DAILY_OPERATIONS') {
      return { operations: parseDailyOperationsRows(rawRows) };
    }

    // Auto-detect based on headers if targetDatasetType is unspecified or combined
    try {
      findLaborHeaderRow(rawRows);
      return { labor: parseDailyLaborRows(rawRows) };
    } catch {
      return { operations: parseDailyOperationsRows(rawRows) };
    }
  }

  // Excel (.xlsx, .xls) workbook parsing
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  let operationsResult: OperationsParseResult | undefined;
  let laborResult: LaborParseResult | undefined;

  for (const worksheet of workbook.worksheets) {
    const rawSheetName = worksheet.name.toLowerCase().replace(/[\s_-]+/g, '');
    const sheetRows: any[][] = [];

    worksheet.eachRow({ includeEmpty: false }, row => {
      const rowValues = (row.values as any[]).slice(1);
      sheetRows.push(rowValues);
    });

    if (
      rawSheetName.includes('dailyoperations') ||
      rawSheetName.includes('dailyoperation') ||
      rawSheetName === 'operations' ||
      rawSheetName === 'operation'
    ) {
      operationsResult = parseDailyOperationsRows(sheetRows);
    } else if (
      rawSheetName.includes('dailylabor') ||
      rawSheetName.includes('dailylabour') ||
      rawSheetName.includes('workforce') ||
      rawSheetName === 'labor' ||
      rawSheetName === 'labour' ||
      rawSheetName === 'manpower'
    ) {
      laborResult = parseDailyLaborRows(sheetRows);
    }
  }

  // If specific sheets weren't identified by name, try identifying by sheet content/headers
  if (!operationsResult && !laborResult && workbook.worksheets.length > 0) {
    if (targetDatasetType === 'COMBINED_OPERATIONS_LABOR') {
      for (const worksheet of workbook.worksheets) {
        const sheetRows: any[][] = [];
        worksheet.eachRow({ includeEmpty: false }, row => {
          sheetRows.push((row.values as any[]).slice(1));
        });
        if (!operationsResult) {
          try {
            findOperationsHeaderRow(sheetRows);
            operationsResult = parseDailyOperationsRows(sheetRows);
            continue;
          } catch {}
        }
        if (!laborResult) {
          try {
            findLaborHeaderRow(sheetRows);
            laborResult = parseDailyLaborRows(sheetRows);
            continue;
          } catch {}
        }
      }

      if (!operationsResult || !laborResult) {
        throw new Error("Combined workbook must contain worksheets named 'Daily_Operations' and 'Daily_Labor'");
      }
    } else {
      const firstSheet = workbook.worksheets[0]!;
      const sheetRows: any[][] = [];
      firstSheet.eachRow({ includeEmpty: false }, row => {
        sheetRows.push((row.values as any[]).slice(1));
      });

      if (targetDatasetType === 'DAILY_LABOR') {
        laborResult = parseDailyLaborRows(sheetRows);
      } else if (targetDatasetType === 'DAILY_OPERATIONS') {
        operationsResult = parseDailyOperationsRows(sheetRows);
      } else {
        try {
          findLaborHeaderRow(sheetRows);
          laborResult = parseDailyLaborRows(sheetRows);
        } catch {
          operationsResult = parseDailyOperationsRows(sheetRows);
        }
      }
    }
  }

  return {
    operations: operationsResult,
    labor: laborResult
  };
}

export async function parseOperationsSpreadsheetBuffer(
  buffer: Buffer,
  isCsv: boolean
): Promise<OperationsParseResult> {
  const res = await parseOperationalWorkbookBuffer(buffer, isCsv, 'DAILY_OPERATIONS');
  return res.operations || {
    records: [],
    errors: [{ rowIndex: 1, message: 'No operational data found in upload' }],
    validRows: 0,
    invalidRows: 1,
    totalRows: 1
  };
}

export async function parseLaborSpreadsheetBuffer(
  buffer: Buffer,
  isCsv: boolean
): Promise<LaborParseResult> {
  const res = await parseOperationalWorkbookBuffer(buffer, isCsv, 'DAILY_LABOR');
  return res.labor || {
    records: [],
    errors: [{ rowIndex: 1, message: 'No labor data found in upload' }],
    warnings: [],
    validRows: 0,
    invalidRows: 1,
    totalRows: 1
  };
}

export async function parseCombinedSpreadsheetBuffer(
  buffer: Buffer,
  isCsv: boolean
): Promise<{
  operations: OperationsParseResult;
  labor: LaborParseResult;
}> {
  const res = await parseOperationalWorkbookBuffer(buffer, isCsv, 'COMBINED_OPERATIONS_LABOR');
  if (!res.operations || !res.labor) {
    throw new Error("Combined workbook must contain worksheets named 'Daily_Operations' and 'Daily_Labor'");
  }
  return {
    operations: res.operations,
    labor: res.labor
  };
}
