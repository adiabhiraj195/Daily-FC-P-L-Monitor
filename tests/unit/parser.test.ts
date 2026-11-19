import { describe, it, expect } from 'vitest';
import { parseSpreadsheetBuffer } from '../../packages/finance/src/ingestion/parser.js';

describe('Spreadsheet & CSV Ingestion Parser Unit Tests', () => {
  it('parses valid CSV content into normalized records', async () => {
    const csvContent = `FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-DEL-01,2026-11-17,100000,20000,10000,5000,12000,3000,5000
FC-BLR-02,2026-11-17,150000,30000,15000,7000,18000,4500,7500
`;
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseSpreadsheetBuffer(buffer, true);

    expect(result.errors.length).toBe(0);
    expect(result.validRows).toBe(2);
    expect(result.records[0]?.fcId).toBe('FC-DEL-01');
    expect(result.records[0]?.revenue).toBe('100000');
    expect(result.records[1]?.fcId).toBe('FC-BLR-02');
  });

  it('parses valid CSV with camelCase headers (e.g. manpowerCost, powerFuelCost)', async () => {
    const csvContent = `fcId,businessDate,revenue,manpowerCost,packagingCost,powerFuelCost,fcRent,equipmentRentals,overheads
FC-DEL-01,2026-11-17,100000,20000,10000,5000,12000,3000,5000
`;
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseSpreadsheetBuffer(buffer, true);

    expect(result.errors.length).toBe(0);
    expect(result.validRows).toBe(1);
    expect(result.records[0]?.fcId).toBe('FC-DEL-01');
    expect(result.records[0]?.manpowerCost).toBe('20000');
    expect(result.records[0]?.powerFuelCost).toBe('5000');
  });

  it('rejects duplicate (fcId, businessDate) in the same file', async () => {
    const csvContent = `FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-DEL-01,2026-11-17,100000,20000,10000,5000,12000,3000,5000
FC-DEL-01,2026-11-17,120000,22000,12000,6000,12000,3000,5000
`;
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseSpreadsheetBuffer(buffer, true);

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.errors[0]?.message).toMatch(/Duplicate entry for FC/);
  });

  it('handles formatted numbers with commas and currency symbols', async () => {
    const csvContent = `FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-MUM-01,2026-11-17,"₹1,50,000","25,000","12,000","5,500","15,000","3,500","6,000"
`;
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseSpreadsheetBuffer(buffer, true);

    expect(result.errors.length).toBe(0);
    expect(result.records[0]?.revenue).toBe('150000');
    expect(result.records[0]?.manpowerCost).toBe('25000');
  });

  it('reports row-level errors for invalid numbers or negative costs', async () => {
    const csvContent = `FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-BAD,2026-11-17,100000,-500,10000,5000,12000,3000,5000
`;
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseSpreadsheetBuffer(buffer, true);

    expect(result.validRows).toBe(0);
    expect(result.invalidRows).toBe(1);
    expect(result.errors[0]?.message).toMatch(/cannot be negative/);
  });

  it('gracefully handles CSV with leading empty or delimiter-only rows', async () => {
    const csvContent = `,,,,,,,,
FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-REW-01,2026-11-01,"112,453","34,221","8,769","14,467","16,846","5,034","13,134"
`;
    const buffer = Buffer.from(csvContent, 'utf-8');
    const result = await parseSpreadsheetBuffer(buffer, true);

    expect(result.errors.length).toBe(0);
    expect(result.validRows).toBe(1);
    expect(result.records[0]?.fcId).toBe('FC-REW-01');
    expect(result.records[0]?.businessDate).toBe('2026-11-01');
    expect(result.records[0]?.revenue).toBe('112453');
  });
});
