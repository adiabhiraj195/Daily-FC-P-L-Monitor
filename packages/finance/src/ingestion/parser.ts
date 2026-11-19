import ExcelJS from 'exceljs';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { NormalizedFCRecord, ParseResult, RowValidationError } from '@prozo/shared';

export interface HeaderMapping {
  fcId: string[];
  businessDate: string[];
  revenue: string[];
  manpowerCost: string[];
  packagingCost: string[];
  powerFuelCost: string[];
  fcRent: string[];
  equipmentRentals: string[];
  overheads: string[];
  currency?: string[];
}

export const DEFAULT_HEADER_MAPPINGS: HeaderMapping = {
  fcId: ['fcid', 'fc_id', 'fc id', 'fulfilment centre', 'fulfilment center', 'fc code', 'fc', 'centre', 'center', 'warehouse'],
  businessDate: ['businessdate', 'business_date', 'business date', 'date', 'day', 'txn_date', 'transaction date', 'pnl date'],
  revenue: ['revenue', 'total revenue', 'sales', 'turnover', 'gross revenue', 'net revenue'],
  manpowerCost: ['manpowercost', 'manpower_cost', 'manpower cost', 'manpower', 'labor', 'labour', 'labor cost', 'labour cost'],
  packagingCost: ['packagingcost', 'packaging_cost', 'packaging cost', 'packaging', 'packing cost', 'packing'],
  powerFuelCost: ['powerfuelcost', 'power_fuel_cost', 'power fuel cost', 'power & fuel', 'power and fuel', 'power & fuel cost', 'power_and_fuel', 'electricity & fuel', 'power fuel', 'power', 'fuel'],
  fcRent: ['fcrent', 'fc_rent', 'fc rent', 'rent', 'warehouse rent', 'facility rent'],
  equipmentRentals: ['equipmentrentals', 'equipment_rentals', 'equipment rentals', 'equipment rental', 'rentals', 'equipment'],
  overheads: ['overheads', 'overhead', 'other overheads', 'admin overheads', 'indirect costs', 'other costs'],
  currency: ['currency', 'curr']
};

/**
 * Normalizes header string to lowercase trimmed alphanumerics with camelCase separation
 */
function cleanHeader(header: string): string {
  return header
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps raw headers from spreadsheet to standard canonical keys
 */
export function mapHeaders(
  rawHeaders: string[],
  customMapping: HeaderMapping = DEFAULT_HEADER_MAPPINGS
): Record<keyof HeaderMapping, number> {
  const result: Partial<Record<keyof HeaderMapping, number>> = {};
  const cleanedRaw = rawHeaders.map((h, idx) => {
    const clean = cleanHeader(String(h ?? ''));
    return {
      clean,
      compact: clean.replace(/\s+/g, ''),
      idx
    };
  });

  for (const [canonicalKey, aliases] of Object.entries(customMapping) as [keyof HeaderMapping, string[]][]) {
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

  // Mandatory fields check
  const mandatoryKeys: (keyof HeaderMapping)[] = [
    'businessDate',
    'revenue',
    'manpowerCost',
    'packagingCost',
    'powerFuelCost',
    'fcRent',
    'equipmentRentals',
    'overheads'
  ];

  for (const key of mandatoryKeys) {
    if (result[key] === undefined) {
      const aliasList = customMapping[key]?.join(', ') || key;
      throw new Error(`Missing mandatory header column: ${key} (Checked aliases: ${aliasList})`);
    }
  }

  return result as Record<keyof HeaderMapping, number>;
}

/**
 * Finds the header row index by testing candidate rows until one matches all mandatory headers.
 * Gracefully ignores leading empty rows, delimiter-only rows, title rows, and metadata rows.
 */
export function findHeaderRow(
  rawRows: any[][],
  customMapping: HeaderMapping = DEFAULT_HEADER_MAPPINGS
): { headerIndex: number; headerMap: Record<keyof HeaderMapping, number> } {
  let firstError: Error | null = null;
  // Scan candidate rows (up to first 25 rows)
  for (let idx = 0; idx < Math.min(rawRows.length, 25); idx++) {
    const row = rawRows[idx];
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }
    const candidateHeaders = row.map(c => (c !== null && c !== undefined ? String(c) : ''));
    try {
      const headerMap = mapHeaders(candidateHeaders, customMapping);
      return { headerIndex: idx, headerMap };
    } catch (err: any) {
      if (!firstError) firstError = err;
    }
  }

  throw firstError || new Error('Could not find a valid header row in the spreadsheet');
}

/**
 * Normalizes Excel date or string date to YYYY-MM-DD
 */
export function normalizeDate(val: any): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]!;
  }
  if (typeof val === 'number') {
    // Excel date serial number (days since Dec 30, 1899)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    return date.toISOString().split('T')[0]!;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Handle DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      const d = ddmmyyyy[1]!.padStart(2, '0');
      const m = ddmmyyyy[2]!.padStart(2, '0');
      const y = ddmmyyyy[3]!;
      return `${y}-${m}-${d}`;
    }
    // Handle YYYY/MM/DD
    const yyyymmdd = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (yyyymmdd) {
      const y = yyyymmdd[1]!;
      const m = yyyymmdd[2]!.padStart(2, '0');
      const d = yyyymmdd[3]!.padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]!;
    }
  }
  throw new Error(`Invalid date format: ${val}`);
}

/**
 * Normalizes monetary value to a sanitized string representation
 */
export function normalizeNumber(val: any, fieldName: string): string {
  if (val === null || val === undefined || val === '') {
    throw new Error(`${fieldName} cannot be blank`);
  }
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) {
      throw new Error(`${fieldName} is an invalid number`);
    }
    return val.toString();
  }
  if (typeof val === 'object' && 'result' in val) {
    // ExcelJS formula result
    return normalizeNumber(val.result, fieldName);
  }
  if (typeof val === 'string') {
    // Strip commas, currency symbols, and extra spaces
    const cleaned = val.replace(/[$₹, ]/g, '').trim();
    if (cleaned === '' || isNaN(Number(cleaned))) {
      throw new Error(`Invalid numeric value for ${fieldName}: '${val}'`);
    }
    return cleaned;
  }
  throw new Error(`Unsupported value type for ${fieldName}: ${typeof val}`);
}

/**
 * Parses buffer (either XLSX or CSV) into normalized records with row-level validation
 */
export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  isCsv: boolean,
  defaultFcId?: string
): Promise<ParseResult> {
  const records: NormalizedFCRecord[] = [];
  const errors: RowValidationError[] = [];
  const seenFCDates = new Set<string>();

  let rawRows: any[][] = [];

  if (isCsv) {
    const csvContent = buffer.toString('utf-8');
    rawRows = parseCsvSync(csvContent, {
      skip_empty_lines: true,
      relax_column_count: true
    });
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Workbook contains no worksheets');
    }

    worksheet.eachRow({ includeEmpty: false }, (row, _rowNum) => {
      const values: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        values[colNum - 1] = cell.value;
      });
      rawRows.push(values);
    });
  }

  if (rawRows.length < 2) {
    throw new Error('Spreadsheet must contain at least a header row and one data row');
  }

  const { headerIndex, headerMap } = findHeaderRow(rawRows);

  let dataRowCount = 0;

  for (let rIdx = headerIndex + 1; rIdx < rawRows.length; rIdx++) {
    const row = rawRows[rIdx]!;
    // Skip completely blank rows
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }
    dataRowCount++;

    try {
      // Resolve FC ID
      let fcId = defaultFcId;
      if (headerMap.fcId !== undefined && row[headerMap.fcId] !== undefined) {
        const fcVal = String(row[headerMap.fcId]).trim();
        if (fcVal) fcId = fcVal;
      }
      if (!fcId) {
        throw new Error('FC ID is missing for this row and no default FC was provided');
      }

      // Resolve business date
      const rawDate = row[headerMap.businessDate];
      const businessDate = normalizeDate(rawDate);

      // Check duplicates within the same file
      const fcDateKey = `${fcId}:${businessDate}`;
      if (seenFCDates.has(fcDateKey)) {
        throw new Error(`Duplicate entry for FC '${fcId}' on date '${businessDate}' in the same file`);
      }
      seenFCDates.add(fcDateKey);

      // Normalize numbers
      const revenue = normalizeNumber(row[headerMap.revenue], 'Revenue');
      if (Number(revenue) <= 0) {
        throw new Error(`Revenue must be greater than 0, got ${revenue}`);
      }

      const manpowerCost = normalizeNumber(row[headerMap.manpowerCost], 'Manpower Cost');
      if (Number(manpowerCost) < 0) throw new Error('Manpower Cost cannot be negative');

      const packagingCost = normalizeNumber(row[headerMap.packagingCost], 'Packaging Cost');
      if (Number(packagingCost) < 0) throw new Error('Packaging Cost cannot be negative');

      const powerFuelCost = normalizeNumber(row[headerMap.powerFuelCost], 'Power & Fuel Cost');
      if (Number(powerFuelCost) < 0) throw new Error('Power & Fuel Cost cannot be negative');

      const fcRent = normalizeNumber(row[headerMap.fcRent], 'FC Rent');
      if (Number(fcRent) < 0) throw new Error('FC Rent cannot be negative');

      const equipmentRentals = normalizeNumber(row[headerMap.equipmentRentals], 'Equipment Rentals');
      if (Number(equipmentRentals) < 0) throw new Error('Equipment Rentals cannot be negative');

      const overheads = normalizeNumber(row[headerMap.overheads], 'Overheads');
      if (Number(overheads) < 0) throw new Error('Overheads cannot be negative');

      let currency = 'INR';
      if (headerMap.currency !== undefined && row[headerMap.currency]) {
        currency = String(row[headerMap.currency]).trim();
      }

      records.push({
        fcId,
        businessDate,
        currency,
        revenue,
        manpowerCost,
        packagingCost,
        powerFuelCost,
        fcRent,
        equipmentRentals,
        overheads,
        sourceRowIndex: rIdx + 1
      });
    } catch (err: any) {
      errors.push({
        rowIndex: rIdx + 1,
        message: err.message || 'Validation error',
        rawValue: row
      });
    }
  }

  return {
    records,
    errors,
    totalRows: dataRowCount,
    validRows: records.length,
    invalidRows: errors.length
  };
}
