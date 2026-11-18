import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

export interface HistoricalDataProvider {
  getFcHistoricalPerformance(fcId: string, businessDate: string, days: number): Promise<any>;
  getCostLineTrend(fcId: string, lineItem: string, businessDate: string, days: number): Promise<any>;
  getSimilarAnomalies(fcId: string, lineItem: string, businessDate: string): Promise<any>;
  getPreviousInvestigations(fcId: string, lineItem: string, businessDate: string): Promise<any>;
  getPriorResolutionFeedback(fcId: string, lineItem: string): Promise<any>;
}

export function createInvestigationTools(
  scopedFcId: string,
  businessDate: string,
  provider: HistoricalDataProvider
) {
  const getFcHistoricalPerformanceTool = new DynamicStructuredTool({
    name: 'getFcHistoricalPerformance',
    description: 'Fetch historical daily performance (revenue, CM1%, CM2%, colours) for this FC up to N days prior.',
    schema: z.object({
      days: z.number().int().min(1).max(90).default(30)
    }),
    func: async ({ days }) => {
      const data = await provider.getFcHistoricalPerformance(scopedFcId, businessDate, days);
      return JSON.stringify(data);
    }
  });

  const getCostLineTrendTool = new DynamicStructuredTool({
    name: 'getCostLineTrend',
    description: 'Fetch historical percentages and amounts for a specific cost line in this FC up to N days prior.',
    schema: z.object({
      lineItem: z.string(),
      days: z.number().int().min(1).max(90).default(30)
    }),
    func: async ({ lineItem, days }) => {
      const data = await provider.getCostLineTrend(scopedFcId, lineItem, businessDate, days);
      return JSON.stringify(data);
    }
  });

  const getSimilarAnomaliesTool = new DynamicStructuredTool({
    name: 'getSimilarAnomalies',
    description: 'Fetch prior recorded anomalies for this cost line or metric in this FC.',
    schema: z.object({
      lineItem: z.string()
    }),
    func: async ({ lineItem }) => {
      const data = await provider.getSimilarAnomalies(scopedFcId, lineItem, businessDate);
      return JSON.stringify(data);
    }
  });

  const getPreviousInvestigationsTool = new DynamicStructuredTool({
    name: 'getPreviousInvestigations',
    description: 'Fetch summaries and causes from previous investigations for this FC.',
    schema: z.object({
      lineItem: z.string()
    }),
    func: async ({ lineItem }) => {
      const data = await provider.getPreviousInvestigations(scopedFcId, lineItem, businessDate);
      return JSON.stringify(data);
    }
  });

  const getPriorResolutionFeedbackTool = new DynamicStructuredTool({
    name: 'getPriorResolutionFeedback',
    description: 'Fetch past manager reviews and resolutions for anomalies on this cost line.',
    schema: z.object({
      lineItem: z.string()
    }),
    func: async ({ lineItem }) => {
      const data = await provider.getPriorResolutionFeedback(scopedFcId, lineItem);
      return JSON.stringify(data);
    }
  });

  return [
    getFcHistoricalPerformanceTool,
    getCostLineTrendTool,
    getSimilarAnomaliesTool,
    getPreviousInvestigationsTool,
    getPriorResolutionFeedbackTool
  ];
}
