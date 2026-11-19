import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

export interface OperationalDataProvider {
  // Financial
  getFinancialTrend(fcId: string, businessDate: string, days: number): Promise<any>;
  getCostLineHistory(fcId: string, lineItem: string, businessDate: string, days: number): Promise<any>;
  getPreviousAnomalies(fcId: string, lineItem?: string, businessDate?: string): Promise<any>;

  // Operational
  getDailyOperations(fcId: string, businessDate: string): Promise<any>;
  getOperationsTrend(fcId: string, businessDate: string, days: number): Promise<any>;
  getThroughputMetrics(fcId: string, businessDate: string): Promise<any>;

  // Workforce
  getDailyLaborMetrics(fcId: string, businessDate: string): Promise<any>;
  getLaborTrend(fcId: string, businessDate: string, days: number): Promise<any>;
  getProductivityMetrics(fcId: string, businessDate: string): Promise<any>;
  getOvertimeAnalysis(fcId: string, businessDate: string): Promise<any>;

  // Data Quality
  getDataCompleteness(fcId: string, businessDate: string): Promise<any>;
  getCostReconciliation(fcId: string, businessDate: string): Promise<any>;

  // Legacy compatibility aliases
  getFcHistoricalPerformance?(fcId: string, businessDate: string, days: number): Promise<any>;
  getCostLineTrend?(fcId: string, lineItem: string, businessDate: string, days: number): Promise<any>;
  getSimilarAnomalies?(fcId: string, lineItem: string, businessDate: string): Promise<any>;
  getPreviousInvestigations?(fcId: string, lineItem: string, businessDate: string): Promise<any>;
  getPriorResolutionFeedback?(fcId: string, lineItem: string): Promise<any>;
}

export type HistoricalDataProvider = OperationalDataProvider;

export function createInvestigationTools(
  scopedFcId: string,
  businessDate: string,
  provider: OperationalDataProvider
) {
  const safeExecute = async (fn: () => Promise<any>) => {
    try {
      const data = await fn();
      if (data === null || data === undefined) {
        return JSON.stringify({ available: false, data: null, note: 'No records found for specified window.' });
      }
      return JSON.stringify(data);
    } catch (err: any) {
      return JSON.stringify({ available: false, error: err.message, status: 'UNAVAILABLE' });
    }
  };

  // 1. Financial: getFinancialTrend
  const getFinancialTrendTool = new DynamicStructuredTool({
    name: 'getFinancialTrend',
    description:
      'Retrieve historical daily financial performance (revenue, CM1%, CM2%, colour classification) for this FC up to N days prior (7, 30, or 90 days). Scoped to current FC.',
    schema: z.object({
      days: z.number().int().min(1).max(90).default(30).describe('Historical lookback window in days (max 90).')
    }),
    func: async ({ days }) => safeExecute(() => provider.getFinancialTrend(scopedFcId, businessDate, days))
  });

  // 2. Financial: getCostLineHistory
  const getCostLineHistoryTool = new DynamicStructuredTool({
    name: 'getCostLineHistory',
    description:
      'Fetch historical percentages, absolute expenditure, and target breaches for a specific cost line in this FC up to N days prior. Use for investigating MANPOWER, PACKAGING, POWER_AND_FUEL, FC_RENT, EQUIPMENT_RENTALS, or OVERHEADS.',
    schema: z.object({
      lineItem: z
        .string()
        .describe('Cost line name (e.g. MANPOWER, PACKAGING, POWER_AND_FUEL, FC_RENT, EQUIPMENT_RENTALS, OVERHEADS)'),
      days: z.number().int().min(1).max(90).default(30).describe('Historical lookback window in days (max 90).')
    }),
    func: async ({ lineItem, days }) =>
      safeExecute(() => provider.getCostLineHistory(scopedFcId, lineItem, businessDate, days))
  });

  // 3. Financial: getPreviousAnomalies
  const getPreviousAnomaliesTool = new DynamicStructuredTool({
    name: 'getPreviousAnomalies',
    description:
      'Fetch previous anomalies detected for this FC and line item to determine recurrence and historical frequency.',
    schema: z.object({
      lineItem: z.string().optional().describe('Optional cost line filter (e.g. MANPOWER, PACKAGING)')
    }),
    func: async ({ lineItem }) =>
      safeExecute(() => provider.getPreviousAnomalies(scopedFcId, lineItem, businessDate))
  });

  // 4. Operational: getDailyOperations
  const getDailyOperationsTool = new DynamicStructuredTool({
    name: 'getDailyOperations',
    description:
      'Retrieve current business date operational metrics (inbound shipments, outbound orders, units, lines, returns, hours, occupancy). NOTE: Current day operational data is already supplied in context; only query if context was missing.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getDailyOperations(scopedFcId, businessDate))
  });

  // 5. Operational: getOperationsTrend
  const getOperationsTrendTool = new DynamicStructuredTool({
    name: 'getOperationsTrend',
    description:
      'Fetch historical daily operational volumes and dispatch throughput trends for this FC up to N days prior (e.g. 7, 30 days).',
    schema: z.object({
      days: z.number().int().min(1).max(90).default(30).describe('Lookback window in days (max 90).')
    }),
    func: async ({ days }) =>
      safeExecute(() => provider.getOperationsTrend(scopedFcId, businessDate, days))
  });

  // 6. Operational: getThroughputMetrics
  const getThroughputMetricsTool = new DynamicStructuredTool({
    name: 'getThroughputMetrics',
    description:
      'Fetch deterministic derived operational throughput metrics (average order lines, units per order, orders per operating hour, returns rate) compared against 7-day and 30-day baselines.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getThroughputMetrics(scopedFcId, businessDate))
  });

  // 7. Workforce: getDailyLaborMetrics
  const getDailyLaborMetricsTool = new DynamicStructuredTool({
    name: 'getDailyLaborMetrics',
    description:
      'Fetch current business date workforce metrics (planned vs actual headcount, paid hours, productive hours, overtime hours, contractor headcount/hours/cost). NOTE: Current day labor is already in context; only query if missing.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getDailyLaborMetrics(scopedFcId, businessDate))
  });

  // 8. Workforce: getLaborTrend
  const getLaborTrendTool = new DynamicStructuredTool({
    name: 'getLaborTrend',
    description:
      'Fetch historical labor and workforce trends (overtime trajectory, utilization, contractor costs) up to N days prior.',
    schema: z.object({
      days: z.number().int().min(1).max(90).default(30).describe('Lookback window in days (max 90).')
    }),
    func: async ({ days }) => safeExecute(() => provider.getLaborTrend(scopedFcId, businessDate, days))
  });

  // 9. Workforce: getProductivityMetrics
  const getProductivityMetricsTool = new DynamicStructuredTool({
    name: 'getProductivityMetrics',
    description:
      'Fetch deterministic workforce productivity metrics (labour utilization %, overtime ratio %, orders per paid hour, units per productive hour, manpower cost per order) compared against historical baselines.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getProductivityMetrics(scopedFcId, businessDate))
  });

  // 10. Workforce: getOvertimeAnalysis
  const getOvertimeAnalysisTool = new DynamicStructuredTool({
    name: 'getOvertimeAnalysis',
    description:
      'Analyze overtime hours in relation to paid hours, contractor hours, and dispatch throughput changes, comparing against weekday-specific baselines.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getOvertimeAnalysis(scopedFcId, businessDate))
  });

  // 11. Data Quality: getDataCompleteness
  const getDataCompletenessTool = new DynamicStructuredTool({
    name: 'getDataCompleteness',
    description:
      'Check availability and version provenance of P&L, Daily_Operations, and Daily_Labor for this FC and date. Reveals whether evidence is COMPLETE or PARTIAL.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getDataCompleteness(scopedFcId, businessDate))
  });

  // 12. Data Quality: getCostReconciliation
  const getCostReconciliationTool = new DynamicStructuredTool({
    name: 'getCostReconciliation',
    description:
      'Reconcile reported contractor expenditure against P&L manpower cost, exposing contractor cost share, hour share, implied hourly rate, and RATE_AND_ALLOCATION_REVIEW signals.',
    schema: z.object({}),
    func: async () => safeExecute(() => provider.getCostReconciliation(scopedFcId, businessDate))
  });

  // Backward-compatibility aliases
  const getFcHistoricalPerformanceTool = new DynamicStructuredTool({
    name: 'getFcHistoricalPerformance',
    description: 'Legacy alias: Fetch historical daily performance.',
    schema: z.object({ days: z.number().int().min(1).max(90).default(30) }),
    func: async ({ days }) => {
      if (provider.getFcHistoricalPerformance) {
        return safeExecute(() => provider.getFcHistoricalPerformance!(scopedFcId, businessDate, days));
      }
      return safeExecute(() => provider.getFinancialTrend(scopedFcId, businessDate, days));
    }
  });

  const getCostLineTrendTool = new DynamicStructuredTool({
    name: 'getCostLineTrend',
    description: 'Legacy alias: Fetch cost line trend.',
    schema: z.object({ lineItem: z.string(), days: z.number().int().min(1).max(90).default(30) }),
    func: async ({ lineItem, days }) => {
      if (provider.getCostLineTrend) {
        return safeExecute(() => provider.getCostLineTrend!(scopedFcId, lineItem, businessDate, days));
      }
      return safeExecute(() => provider.getCostLineHistory(scopedFcId, lineItem, businessDate, days));
    }
  });

  return [
    getFinancialTrendTool,
    getCostLineHistoryTool,
    getPreviousAnomaliesTool,
    getDailyOperationsTool,
    getOperationsTrendTool,
    getThroughputMetricsTool,
    getDailyLaborMetricsTool,
    getLaborTrendTool,
    getProductivityMetricsTool,
    getOvertimeAnalysisTool,
    getDataCompletenessTool,
    getCostReconciliationTool,
    getFcHistoricalPerformanceTool,
    getCostLineTrendTool
  ];
}
