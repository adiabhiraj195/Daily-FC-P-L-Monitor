import { describe, it, expect } from 'vitest';
import {
  ExcelJS,
  parseOperationsSpreadsheetBuffer,
  parseLaborSpreadsheetBuffer,
  parseCombinedSpreadsheetBuffer
} from '../../packages/finance/src/index.js';

describe('Operational and Labor Ingestion Parser Unit Tests', () => {
  describe('Daily Operations Ingestion', () => {
    it('parses valid operations CSV with all throughput columns', async () => {
      const csv = `FC_ID,Business Date,Inbound Shipments,Outbound Orders,Units Processed,Order Lines Processed,Returns Processed,Operating Hours,Storage Occupancy %
FC-DEL-01,2026-11-20,45,1200,5400,2800,32,16,78.5
FC-BLR-01,2026-11-20,60,1850,7200,4100,50,20,84.0
`;
      const result = await parseOperationsSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.errors.length).toBe(0);
      expect(result.validRows).toBe(2);
      expect(result.records[0]).toMatchObject({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        inboundShipments: 45,
        outboundOrders: 1200,
        unitsProcessed: 5400,
        orderLinesProcessed: 2800,
        returnsProcessed: 32,
        operatingHours: 16,
        storageOccupancyPct: 78.5
      });
      expect(result.records[1]?.fcId).toBe('FC-BLR-01');
    });

    it('parses operations CSV with camelCase headers (e.g. inboundShipments, businessDate)', async () => {
      const csv = `fcId,businessDate,inboundShipments,outboundOrders,unitsProcessed,orderLinesProcessed,returnsProcessed,operatingHours,storageOccupancyPct
FC-REW-01,2026-11-21,22,2850,5750,4210,105,15.5,79.0
FC-DEL-01,2026-11-21,34,4680,9360,7020,185,17.0,84.5
FC-BLR-01,2026-11-21,19,3320,6640,4980,142,15.0,77.5
FC-MUM-01,2026-11-21,46,5150,10300,7725,260,18.0,94.0
FC-HYD-01,2026-11-21,17,2760,5520,4140,98,14.5,73.0
`;
      const result = await parseOperationsSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.errors.length).toBe(0);
      expect(result.validRows).toBe(5);
      expect(result.records[0]).toMatchObject({
        fcId: 'FC-REW-01',
        businessDate: '2026-11-21',
        inboundShipments: 22,
        outboundOrders: 2850,
        unitsProcessed: 5750,
        orderLinesProcessed: 4210,
        returnsProcessed: 105,
        operatingHours: 15.5,
        storageOccupancyPct: 79.0
      });
      expect(result.records[3]?.fcId).toBe('FC-MUM-01');
      expect(result.records[3]?.inboundShipments).toBe(46);
    });

    it('allows null storage occupancy and does not convert missing values to 0', async () => {
      const csv = `FC_ID,Business Date,Inbound Shipments,Outbound Orders,Units Processed,Order Lines Processed,Returns Processed,Operating Hours,Storage Occupancy %
FC-HYD-01,2026-11-20,10,200,800,450,5,10,
`;
      const result = await parseOperationsSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.errors.length).toBe(0);
      expect(result.validRows).toBe(1);
      expect(result.records[0]?.storageOccupancyPct).toBeNull();
    });

    it('validates storage occupancy boundary values (0-100)', async () => {
      const csv = `FC_ID,Business Date,Inbound Shipments,Outbound Orders,Units Processed,Order Lines Processed,Returns Processed,Operating Hours,Storage Occupancy %
FC-DEL-01,2026-11-20,10,200,800,450,5,10,105.0
FC-BLR-01,2026-11-20,10,200,800,450,5,10,-5.0
FC-MUM-01,2026-11-20,10,200,800,450,5,10,100.0
FC-KOL-01,2026-11-20,10,200,800,450,5,10,0.0
`;
      const result = await parseOperationsSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.validRows).toBe(2); // MUM (100) and KOL (0) are valid
      expect(result.invalidRows).toBe(2); // DEL (105) and BLR (-5) are invalid
      expect(result.errors.some(e => e.rowIndex === 2 && e.field === 'storageOccupancyPct')).toBe(true);
      expect(result.errors.some(e => e.rowIndex === 3 && e.field === 'storageOccupancyPct')).toBe(true);
    });

    it('flags row-level errors for missing required fields or negative counts', async () => {
      const csv = `FC_ID,Business Date,Inbound Shipments,Outbound Orders,Units Processed,Order Lines Processed,Returns Processed,Operating Hours,Storage Occupancy %
FC-DEL-01,2026-11-20,-5,1200,5400,2800,32,16,75
FC-BLR-01,2026-11-20,10,,5400,2800,32,16,75
`;
      const result = await parseOperationsSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.validRows).toBe(0);
      expect(result.invalidRows).toBe(2);
      expect(result.errors.some(e => e.rowIndex === 2 && e.message.includes('non-negative'))).toBe(true);
      expect(result.errors.some(e => e.rowIndex === 3 && e.field === 'outboundOrders')).toBe(true);
    });

    it('detects duplicate (fcId, businessDate) entries in the operations file', async () => {
      const csv = `FC_ID,Business Date,Inbound Shipments,Outbound Orders,Units Processed,Order Lines Processed,Returns Processed,Operating Hours,Storage Occupancy %
FC-DEL-01,2026-11-20,45,1200,5400,2800,32,16,75
FC-DEL-01,2026-11-20,50,1300,5600,2900,35,16,76
`;
      const result = await parseOperationsSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.message).toMatch(/Duplicate entry for FC/);
    });
  });

  describe('Daily Labor Ingestion', () => {
    it('parses valid labor CSV with workforce and contractor details', async () => {
      const csv = `FC_ID,Business Date,Planned Headcount,Actual Headcount,Planned Labour Hours,Actual Paid Hours,Productive Hours,Overtime Hours,Contractor Headcount,Contractor Hours,Contractor Cost
FC-DEL-01,2026-11-20,25,24,200,210,185,15,6,48,"₹14,400"
FC-BLR-01,2026-11-20,30,32,240,280,230,40,10,80,24000
`;
      const result = await parseLaborSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.errors.length).toBe(0);
      expect(result.validRows).toBe(2);
      expect(result.records[0]).toMatchObject({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        plannedHeadcount: 25,
        actualHeadcount: 24,
        plannedLabourHours: 200,
        actualPaidHours: 210,
        productiveHours: 185,
        overtimeHours: 15,
        contractorHeadcount: 6,
        contractorHours: 48,
        contractorCost: '14400'
      });
    });

    it('parses valid labor CSV with camelCase headers and US spelling (plannedLaborHours)', async () => {
      const csv = `fcId,businessDate,plannedHeadcount,actualHeadcount,plannedLaborHours,actualPaidHours,productiveHours,overtimeHours,contractorHeadcount,contractorHours,contractorCost
FC-DEL-01,2026-11-20,25,24,200,210,185,15,6,48,14400
FC-BLR-01,2026-11-20,30,32,240,280,230,40,10,80,24000
`;
      const result = await parseLaborSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.errors.length).toBe(0);
      expect(result.validRows).toBe(2);
      expect(result.records[0]).toMatchObject({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        plannedHeadcount: 25,
        actualHeadcount: 24,
        plannedLabourHours: 200,
        actualPaidHours: 210,
        productiveHours: 185,
        overtimeHours: 15,
        contractorHeadcount: 6,
        contractorHours: 48,
        contractorCost: '14400'
      });
    });

    it('handles blank contractor cost by defaulting to 0 when contractor headcount and hours are 0', async () => {
      const csv = `FC_ID,Business Date,Planned Headcount,Actual Headcount,Planned Labour Hours,Actual Paid Hours,Productive Hours,Overtime Hours,Contractor Headcount,Contractor Hours,Contractor Cost
FC-HYD-01,2026-11-20,20,20,160,160,150,0,0,0,
`;
      const result = await parseLaborSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.errors.length).toBe(0);
      expect(result.validRows).toBe(1);
      expect(result.records[0]?.contractorCost).toBe('0');
    });

    it('enforces logical hour constraints: productive <= actualPaidHours', async () => {
      const csv = `FC_ID,Business Date,Planned Headcount,Actual Headcount,Planned Labour Hours,Actual Paid Hours,Productive Hours,Overtime Hours,Contractor Headcount,Contractor Hours,Contractor Cost
FC-BAD-01,2026-11-20,20,20,160,160,175,0,0,0,0
`;
      const result = await parseLaborSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.validRows).toBe(0);
      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('productiveHours');
      expect(result.errors[0]?.message).toMatch(/cannot exceed actual paid hours/);
    });

    it('enforces logical hour constraints: overtime <= actualPaidHours and contractor <= actualPaidHours', async () => {
      const csv = `FC_ID,Business Date,Planned Headcount,Actual Headcount,Planned Labour Hours,Actual Paid Hours,Productive Hours,Overtime Hours,Contractor Headcount,Contractor Hours,Contractor Cost
FC-BAD-02,2026-11-20,20,20,160,160,140,180,0,0,0
FC-BAD-03,2026-11-20,20,20,160,160,140,20,5,190,15000
`;
      const result = await parseLaborSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.validRows).toBe(0);
      expect(result.invalidRows).toBe(2);
      expect(result.errors.some(e => e.rowIndex === 2 && e.field === 'overtimeHours')).toBe(true);
      expect(result.errors.some(e => e.rowIndex === 3 && e.field === 'contractorHours')).toBe(true);
    });

    it('emits operational warnings for high overtime and low labor utilization without rejecting valid rows', async () => {
      const csv = `FC_ID,Business Date,Planned Headcount,Actual Headcount,Planned Labour Hours,Actual Paid Hours,Productive Hours,Overtime Hours,Contractor Headcount,Contractor Hours,Contractor Cost
FC-WARN-01,2026-11-20,20,20,160,200,90,70,5,40,12000
`;
      const result = await parseLaborSpreadsheetBuffer(Buffer.from(csv, 'utf-8'), true);

      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(0);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings.some(w => w.code === 'HIGH_OVERTIME_RATIO')).toBe(true);
      expect(result.warnings.some(w => w.code === 'LOW_LABOR_UTILIZATION')).toBe(true);
    });
  });

  describe('Multi-Sheet Combined Excel Workbook Ingestion', () => {
    it('parses multi-sheet workbook containing both Daily_Operations and Daily_Labor', async () => {
      const wb = new ExcelJS.Workbook();

      const wsOps = wb.addWorksheet('Daily_Operations');
      wsOps.addRow([
        'FC_ID',
        'Business Date',
        'Inbound Shipments',
        'Outbound Orders',
        'Units Processed',
        'Order Lines Processed',
        'Returns Processed',
        'Operating Hours',
        'Storage Occupancy %'
      ]);
      wsOps.addRow(['FC-DEL-01', '2026-11-20', 50, 1500, 6500, 3200, 40, 16, 82]);

      const wsLabor = wb.addWorksheet('Daily_Labor');
      wsLabor.addRow([
        'FC_ID',
        'Business Date',
        'Planned Headcount',
        'Actual Headcount',
        'Planned Labour Hours',
        'Actual Paid Hours',
        'Productive Hours',
        'Overtime Hours',
        'Contractor Headcount',
        'Contractor Hours',
        'Contractor Cost'
      ]);
      wsLabor.addRow(['FC-DEL-01', '2026-11-20', 30, 28, 240, 250, 220, 20, 8, 64, 19200]);

      const arrayBuf = await wb.xlsx.writeBuffer();
      const buf = Buffer.from(arrayBuf);
      const result = await parseCombinedSpreadsheetBuffer(buf, false);

      expect(result.operations.validRows).toBe(1);
      expect(result.labor.validRows).toBe(1);
      expect(result.operations.records[0]?.fcId).toBe('FC-DEL-01');
      expect(result.labor.records[0]?.contractorCost).toBe('19200');
    });

    it('rejects combined workbook if required sheets are missing', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('RandomSheet');
      ws.addRow(['A', 'B']);
      ws.addRow([1, 2]);

      const arrayBuf = await wb.xlsx.writeBuffer();
      const buf = Buffer.from(arrayBuf);
      await expect(parseCombinedSpreadsheetBuffer(buf, false)).rejects.toThrow(
        /Combined workbook must contain worksheets named 'Daily_Operations' and 'Daily_Labor'/
      );
    });
  });
});
