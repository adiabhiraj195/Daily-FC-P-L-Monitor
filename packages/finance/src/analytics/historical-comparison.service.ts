import { MetricHistoricalComparison } from '@prozo/shared';

export interface HistoricalDatapoint {
  businessDate: string; // YYYY-MM-DD or ISO string
  value: number | null | undefined;
}

/**
 * Builds baseline comparison between a current metric value and historical records.
 * Supports window averages (7d, 30d, 90d) and weekday-specific baselines.
 */
export function compareMetricToHistorical(
  metricName: string,
  currentValue: number | null | undefined,
  historicalRecords: HistoricalDatapoint[],
  unit: string,
  options: {
    targetBusinessDate?: string;
    windowDays?: number; // e.g. 7, 30, 90
    matchWeekday?: boolean;
    dataSource?: string;
  } = {}
): MetricHistoricalComparison {
  const {
    targetBusinessDate,
    windowDays = 30,
    matchWeekday = false,
    dataSource = 'PostgreSQL Historical Store'
  } = options;

  const dataPeriod = `Last ${windowDays} Days${matchWeekday ? ' (Same Weekday)' : ''}`;

  if (currentValue === null || currentValue === undefined || isNaN(currentValue)) {
    return {
      metric: metricName,
      currentValue: null,
      baselineValue: null,
      absoluteChange: null,
      percentageChange: null,
      unit,
      sampleSize: 0,
      dataSource,
      dataPeriod
    };
  }

  const currentDateObj = targetBusinessDate ? new Date(targetBusinessDate) : new Date();
  const currentWeekday = currentDateObj.getUTCDay();

  // Filter historical records: strictly prior to target business date, within window, non-null
  const filtered = historicalRecords.filter(r => {
    if (r.value === null || r.value === undefined || isNaN(Number(r.value))) {
      return false;
    }

    const recDate = new Date(r.businessDate);
    if (targetBusinessDate && recDate.getTime() >= currentDateObj.getTime()) {
      return false;
    }

    if (windowDays > 0) {
      const diffMs = currentDateObj.getTime() - recDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > windowDays) {
        return false;
      }
    }

    if (matchWeekday && recDate.getUTCDay() !== currentWeekday) {
      return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    return {
      metric: metricName,
      currentValue: Number(currentValue.toFixed(4)),
      baselineValue: null,
      absoluteChange: null,
      percentageChange: null,
      unit,
      sampleSize: 0,
      dataSource,
      dataPeriod
    };
  }

  const sum = filtered.reduce((acc, r) => acc + Number(r.value), 0);
  const baselineValue = Number((sum / filtered.length).toFixed(4));
  const absoluteChange = Number((currentValue - baselineValue).toFixed(4));

  let percentageChange: number | null = null;
  if (baselineValue !== 0) {
    percentageChange = Number((((currentValue - baselineValue) / Math.abs(baselineValue)) * 100).toFixed(2));
  }

  return {
    metric: metricName,
    currentValue: Number(currentValue.toFixed(4)),
    baselineValue,
    absoluteChange,
    percentageChange,
    unit,
    sampleSize: filtered.length,
    dataSource,
    dataPeriod
  };
}

/**
 * Builds standard 7-day, 30-day, and 90-day comparison suite for a metric.
 */
export function buildMultiWindowComparisons(
  metricName: string,
  currentValue: number | null | undefined,
  historicalRecords: HistoricalDatapoint[],
  unit: string,
  targetBusinessDate?: string
): {
  sevenDay: MetricHistoricalComparison;
  thirtyDay: MetricHistoricalComparison;
  ninetyDay: MetricHistoricalComparison;
  weekdayComparable: MetricHistoricalComparison;
} {
  return {
    sevenDay: compareMetricToHistorical(metricName, currentValue, historicalRecords, unit, {
      targetBusinessDate,
      windowDays: 7,
      dataSource: '7-Day Historical Moving Average'
    }),
    thirtyDay: compareMetricToHistorical(metricName, currentValue, historicalRecords, unit, {
      targetBusinessDate,
      windowDays: 30,
      dataSource: '30-Day Historical Moving Average'
    }),
    ninetyDay: compareMetricToHistorical(metricName, currentValue, historicalRecords, unit, {
      targetBusinessDate,
      windowDays: 90,
      dataSource: '90-Day Historical Moving Average'
    }),
    weekdayComparable: compareMetricToHistorical(metricName, currentValue, historicalRecords, unit, {
      targetBusinessDate,
      windowDays: 60,
      matchWeekday: true,
      dataSource: 'Day-of-Week Comparable Average'
    })
  };
}

/**
 * Builds compact canonical historical summary, ensuring zero historical records are
 * explicitly represented as unavailable rather than inventing zeroes or repeating nulls.
 */
export function buildHistoricalSummary(
  comparisons: Record<string, MetricHistoricalComparison | undefined>,
  priorSubmissionsCount: number,
  recurringAnomalyCount = 0
): {
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
} {
  if (priorSubmissionsCount === 0) {
    return {
      available: false,
      sampleSize: 0,
      metrics: [],
      recurringAnomalyCount: 0
    };
  }

  const validMetrics = Object.entries(comparisons)
    .filter(([_, comp]) => comp && comp.sampleSize > 0 && typeof comp.baselineValue === 'number')
    .map(([metric, comp]) => ({
      metric,
      currentValue: comp!.currentValue ?? 0,
      baselineValue: comp!.baselineValue!,
      changePct: comp!.percentageChange ?? 0,
      unit: comp!.unit
    }));

  return {
    available: validMetrics.length > 0,
    sampleSize: priorSubmissionsCount,
    metrics: validMetrics,
    recurringAnomalyCount
  };
}
