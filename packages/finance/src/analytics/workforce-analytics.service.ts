import { DailyLaborInput, DailyOperationsInput, DerivedWorkforceMetrics } from '@prozo/shared';

/**
 * Calculates deterministic workforce, labor hours, and productivity ratios.
 * Returns null whenever denominators are zero or input data is unavailable.
 */
export function calculateWorkforceMetrics(
  labor: DailyLaborInput | null | undefined,
  operations?: DailyOperationsInput | null
): DerivedWorkforceMetrics {
  if (!labor) {
    return {
      labourUtilization: null,
      overtimeRatio: null,
      ordersPerPaidLabourHour: null,
      unitsPerProductiveLabourHour: null,
      actualVsPlannedLabourHours: null,
      contractorHourShare: null
    };
  }

  const productiveHours = Number(labor.productiveHours);
  const actualPaidHours = Number(labor.actualPaidHours);
  const overtimeHours = Number(labor.overtimeHours);
  const plannedLabourHours = Number(labor.plannedLabourHours);
  const contractorHours = Number(labor.contractorHours);

  const labourUtilization =
    actualPaidHours > 0 && !isNaN(productiveHours)
      ? Number(((productiveHours / actualPaidHours) * 100).toFixed(4))
      : null;

  const overtimeRatio =
    actualPaidHours > 0 && !isNaN(overtimeHours)
      ? Number(((overtimeHours / actualPaidHours) * 100).toFixed(4))
      : null;

  const actualVsPlannedLabourHours =
    plannedLabourHours > 0 && !isNaN(actualPaidHours)
      ? Number(((actualPaidHours / plannedLabourHours) * 100).toFixed(4))
      : null;

  const contractorHourShare =
    actualPaidHours > 0 && !isNaN(contractorHours)
      ? Number(((contractorHours / actualPaidHours) * 100).toFixed(4))
      : null;

  let ordersPerPaidLabourHour: number | null = null;
  let unitsPerProductiveLabourHour: number | null = null;

  if (operations) {
    const outboundOrders = Number(operations.outboundOrders);
    const unitsProcessed = Number(operations.unitsProcessed);

    if (actualPaidHours > 0 && !isNaN(outboundOrders)) {
      ordersPerPaidLabourHour = Number((outboundOrders / actualPaidHours).toFixed(4));
    }

    if (productiveHours > 0 && !isNaN(unitsProcessed)) {
      unitsPerProductiveLabourHour = Number((unitsProcessed / productiveHours).toFixed(4));
    }
  }

  return {
    labourUtilization,
    overtimeRatio,
    ordersPerPaidLabourHour,
    unitsPerProductiveLabourHour,
    actualVsPlannedLabourHours,
    contractorHourShare
  };
}
